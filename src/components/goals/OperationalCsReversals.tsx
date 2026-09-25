import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

interface Row {
  key: string;
  date: string;
  kind: "Retido" | "Recuperado";
  client: string;
  plan: string;
  channel: string;
  reason: string;
  owner: string;
  qty: number;
  mrr: number;
}

const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const CHANNEL_LABEL: Record<string, string> = { cobranca: "Cobrança", cs: "CS" };

/**
 * Aba "Reversões CS" do relatório do mês em Metas Operacionais.
 * Lista Retidos e Recuperados do mês com a mesma fonte do painel tático:
 * reativações Stripe (is_reactivation) + tactical_recoveries + tactical_manual_entries.
 */
export function OperationalCsReversals({ monthStartKey, monthEndKey }: { monthStartKey: string; monthEndKey: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<"all" | "Retido" | "Recuperado">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [y, m] = monthEndKey.split("-").map(Number);
      const endExcl = new Date(Date.UTC(y, m - 1, Number(monthEndKey.slice(8, 10)) + 1, 3)).toISOString();

      const metricRes = await supabase
        .from("tactical_metrics")
        .select("id, key")
        .in("key", ["clientes_recuperados", "clientes_retidos"]);
      const metricIds = (metricRes.data || []).map((x: any) => x.id);

      const [convRes, recRes, manualRes, reasonsRes] = await Promise.all([
        fetchAllPaged<any>(() => supabase.from("stripe_conversions")
          .select("id, customer_email, plan_name, product_name, converted_at, mrr, mrr_net, assigned_seller_id")
          .eq("is_reactivation", true)
          .gte("converted_at", `${monthStartKey}T03:00:00Z`).lt("converted_at", endExcl)
          .order("id") as any),
        fetchAllPaged<any>(() => supabase.from("tactical_recoveries")
          .select("id, customer_name, customer_email, plan_name, seller_id, recovered_at, mrr, entry_kind, recovery_channel, reason_id")
          .gte("recovered_at", monthStartKey).lte("recovered_at", monthEndKey)
          .order("id") as any),
        metricIds.length
          ? fetchAllPaged<any>(() => supabase.from("tactical_manual_entries")
              .select("id, user_id, entry_date, value, mrr_value, note, entry_kind, recovery_channel, reason_id")
              .in("metric_id", metricIds)
              .gte("entry_date", monthStartKey).lte("entry_date", monthEndKey)
              .order("id") as any)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("tactical_recovery_reasons").select("id, name"),
      ]);

      const reasonName = new Map<string, string>(((reasonsRes as any).data || []).map((r: any) => [r.id, r.name]));
      const list: Row[] = [];

      for (const c of convRes.data || []) {
        const mrr = Number(c.mrr_net ?? c.mrr ?? 0);
        if (mrr <= 0) continue;
        list.push({
          key: `s-${c.id}`,
          date: new Date(c.converted_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
          kind: "Recuperado",
          client: c.customer_email || "—",
          plan: c.plan_name || c.product_name || "—",
          channel: "cobranca",
          reason: "Reativação automática (Stripe)",
          owner: c.assigned_seller_id || "",
          qty: 1,
          mrr,
        });
      }
      for (const r of recRes.data || []) {
        list.push({
          key: `r-${r.id}`,
          date: String(r.recovered_at).slice(0, 10),
          kind: r.entry_kind === "retained" ? "Retido" : "Recuperado",
          client: r.customer_name || r.customer_email || "—",
          plan: r.plan_name || "—",
          channel: r.recovery_channel === "cobranca" ? "cobranca" : "cs",
          reason: (r.reason_id && reasonName.get(r.reason_id)) || "Sem motivo declarado",
          owner: r.seller_id || "",
          qty: 1,
          mrr: Number(r.mrr || 0),
        });
      }
      for (const e of (manualRes as any).data || []) {
        list.push({
          key: `m-${e.id}`,
          date: String(e.entry_date).slice(0, 10),
          kind: e.entry_kind === "retained" ? "Retido" : "Recuperado",
          client: e.note || "Lançamento manual",
          plan: "—",
          channel: e.recovery_channel === "cobranca" ? "cobranca" : "cs",
          reason: (e.reason_id && reasonName.get(e.reason_id)) || "Sem motivo declarado",
          owner: e.user_id || "",
          qty: Number(e.value || 0),
          mrr: Number(e.mrr_value || 0),
        });
      }

      // Nome do contato (quando só temos e-mail) e nome do responsável
      const emails = [...new Set(list.map((r) => r.client).filter((c) => c.includes("@")).map((c) => c.toLowerCase()))];
      const nameByEmail = new Map<string, string>();
      for (let i = 0; i < emails.length; i += 200) {
        const { data } = await supabase.from("contacts").select("name, email").in("email", emails.slice(i, i + 200)).limit(1000);
        (data || []).forEach((c: any) => { if (c.name) nameByEmail.set(String(c.email).toLowerCase(), c.name); });
      }
      const ownerIds = [...new Set(list.map((r) => r.owner).filter(Boolean))];
      const ownerName = new Map<string, string>();
      if (ownerIds.length) {
        const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ownerIds);
        (data || []).forEach((p: any) => ownerName.set(p.user_id, p.full_name));
      }
      for (const r of list) {
        if (r.client.includes("@") && nameByEmail.get(r.client.toLowerCase())) {
          r.client = `${nameByEmail.get(r.client.toLowerCase())} (${r.client})`;
        }
        r.owner = ownerName.get(r.owner) || "—";
      }

      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.mrr - a.mrr));
      if (!cancelled) { setRows(list); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [monthStartKey, monthEndKey]);

  const shown = useMemo(() => rows.filter((r) =>
    (kindFilter === "all" || r.kind === kindFilter) &&
    (channelFilter === "all" || r.channel === channelFilter),
  ), [rows, kindFilter, channelFilter]);

  const totalMrr = shown.reduce((s, r) => s + r.mrr, 0);
  const retainedQty = shown.filter((r) => r.kind === "Retido").reduce((s, r) => s + r.qty, 0);
  const recoveredQty = shown.filter((r) => r.kind === "Recuperado").reduce((s, r) => s + r.qty, 0);

  const exportCsv = () => {
    const head = ["Data", "Tipo", "Cliente", "Plano", "Canal", "Motivo", "Responsável", "Qtd", "MRR"];
    const lines = shown.map((r) => [br(r.date), r.kind, r.client, r.plan, CHANNEL_LABEL[r.channel] || r.channel, r.reason, r.owner, r.qty, r.mrr.toFixed(2)]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["\ufeff" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `reversoes-cs-${monthStartKey.slice(0, 7)}.csv`; a.click();
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando reversões…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm sm:px-6">
        <Badge variant="secondary">{recoveredQty} recuperados</Badge>
        <Badge variant="outline">{retainedQty} retidos</Badge>
        <span>MRR evitado/recuperado: <b>{money(totalMrr)}</b></span>
        <div className="ml-auto flex gap-2">
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="Recuperado">Recuperados</SelectItem>
              <SelectItem value="Retido">Retidos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="cobranca">Cobrança</SelectItem>
              <SelectItem value="cs">CS</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />CSV</Button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Nenhuma retenção ou recuperação registrada neste mês.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Valor do MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{br(r.date)}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === "Retido" ? "outline" : "secondary"}>{r.kind}</Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate" title={r.client}>{r.client}</TableCell>
                  <TableCell>{r.plan}</TableCell>
                  <TableCell>{CHANNEL_LABEL[r.channel] || r.channel}</TableCell>
                  <TableCell className="max-w-48 truncate" title={r.reason}>{r.reason}</TableCell>
                  <TableCell>{r.owner}</TableCell>
                  <TableCell className="text-right font-medium">{money(r.mrr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>{shown.length} registros</TableCell>
                <TableCell className="text-right font-bold">{money(totalMrr)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
