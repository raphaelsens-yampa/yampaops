import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

export interface ScreenOp { client: string; value: number; type: string }
type Status = "Confere" | "Valor diferente" | "Só no CRM" | "Só na tela";
interface CrmRow { key: string; name: string; email: string; deal: string; owner: string; date: string; crm: number | null; screen: number | null; status: Status }

const money = (v: number | null) => (v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const norm = (e: string | null | undefined) => String(e || "").trim().toLowerCase();
const spDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  Confere: "secondary", "Valor diferente": "destructive", "Só no CRM": "outline", "Só na tela": "outline",
};

export function OperationalCrmConversions({ monthStartKey, monthEndKey, screenOps }: { monthStartKey: string; monthEndKey: string; screenOps: ScreenOp[] }) {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [y, m] = monthEndKey.split("-").map(Number);
      const endExcl = new Date(Date.UTC(y, m - 1, Number(monthEndKey.slice(8, 10)) + 1, 3)).toISOString();
      const { data } = await fetchAllPaged<any>(() => supabase.from("ac_funnel_deals")
        .select("ac_deal_id, title, contact_name, contact_email, owner_name, value, closed_at")
        .eq("status", 1).gte("closed_at", `${monthStartKey}T03:00:00Z`).lt("closed_at", endExcl)
        .order("ac_deal_id") as any);
      if (!cancelled) { setDeals(data || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [monthStartKey, monthEndKey]);

  const rows = useMemo<CrmRow[]>(() => {
    const screenBy = new Map<string, number>();
    screenOps.forEach((o) => { const k = norm(o.client); screenBy.set(k, (screenBy.get(k) || 0) + o.value); });
    const crmBy = new Map<string, number>();
    deals.forEach((d) => { const k = norm(d.contact_email); if (k) crmBy.set(k, (crmBy.get(k) || 0) + Number(d.value || 0)); });
    const out: CrmRow[] = deals.map((d) => {
      const k = norm(d.contact_email);
      const scr = k ? screenBy.get(k) ?? null : null;
      const crmSum = k ? crmBy.get(k) ?? 0 : Number(d.value || 0);
      const status: Status = scr == null ? "Só no CRM" : Math.abs(crmSum - scr) < 1 ? "Confere" : "Valor diferente";
      return { key: `d${d.ac_deal_id}`, name: d.contact_name || "—", email: d.contact_email || "—", deal: d.title || "—", owner: d.owner_name || "—", date: d.closed_at, crm: Number(d.value || 0), screen: scr, status };
    });
    screenBy.forEach((v, k) => {
      if (!crmBy.has(k)) out.push({ key: `s${k}`, name: "—", email: k, deal: "—", owner: "—", date: "", crm: null, screen: v, status: "Só na tela" });
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [deals, screenOps]);

  const shown = filter === "all" ? rows : filter === "div" ? rows.filter((r) => r.status !== "Confere") : rows.filter((r) => r.status === filter);
  const crmTotal = deals.reduce((s, d) => s + Number(d.value || 0), 0);
  const screenTotal = screenOps.reduce((s, o) => s + o.value, 0);
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});

  const exportCsv = () => {
    const head = ["Nome", "E-mail", "Negócio", "Proprietário", "Data de fechamento", "Valor CRM", "Valor tela", "Status"];
    const lines = shown.map((r) => [r.name, r.email, r.deal, r.owner, r.date ? spDate(r.date) : "", r.crm ?? "", r.screen ?? "", r.status]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["\ufeff" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `conversoes-crm-${monthStartKey.slice(0, 7)}.csv`; a.click();
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando conversões do CRM…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-3 text-sm sm:px-6">
        <span>CRM: <b>{money(crmTotal)}</b> ({deals.length})</span>
        <span>Tela: <b>{money(screenTotal)}</b></span>
        <span>Diferença: <b>{money(crmTotal - screenTotal)}</b></span>
        <span className="text-muted-foreground">{(["Confere", "Valor diferente", "Só no CRM", "Só na tela"] as Status[]).map((s) => `${s}: ${counts[s] || 0}`).join(" · ")}</span>
        <div className="ml-auto flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="div">Só divergentes</SelectItem>
              <SelectItem value="Confere">Confere</SelectItem>
              <SelectItem value="Valor diferente">Valor diferente</SelectItem>
              <SelectItem value="Só no CRM">Só no CRM</SelectItem>
              <SelectItem value="Só na tela">Só na tela</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />CSV</Button>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do contato</TableHead><TableHead>E-mail</TableHead><TableHead>Negócio</TableHead>
              <TableHead>Proprietário</TableHead><TableHead>Fechamento</TableHead>
              <TableHead className="text-right">Valor CRM</TableHead><TableHead className="text-right">Valor tela</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.key}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="max-w-56 truncate" title={r.email}>{r.email}</TableCell>
                <TableCell className="max-w-56 truncate" title={r.deal}>{r.deal}</TableCell>
                <TableCell>{r.owner}</TableCell>
                <TableCell>{r.date ? spDate(r.date) : "—"}</TableCell>
                <TableCell className="text-right">{money(r.crm)}</TableCell>
                <TableCell className="text-right">{money(r.screen)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
