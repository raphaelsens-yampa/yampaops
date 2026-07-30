import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDateBR } from "@/lib/dateBR";
import { Profile, TacticalMetric, toBRDateKey } from "./types";

interface Row {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  date: string;
  price: number;
  mrr: number;
  seller_id: string | null;
  origin: "stripe" | "manual";
  qty: number;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function TeamRecoveriesTable({
  memberIds,
  profiles,
  metrics,
  teamName,
  today,
  refreshKey = 0,
}: {
  memberIds: string[];
  profiles: Profile[];
  metrics: TacticalMetric[];
  teamName: string | null;
  today: Date;
  refreshKey?: number;
}) {
  const [days, setDays] = useState("30");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const recoveryMetricIds = useMemo(
    () =>
      metrics
        .filter((m) => m.key === "clientes_recuperados" || m.source === "stripe_reactivation")
        .map((m) => m.id),
    [metrics],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const from = new Date(today);
      from.setDate(from.getDate() - (Number(days) - 1));
      from.setHours(0, 0, 0, 0);
      const to = new Date(today);
      to.setHours(23, 59, 59, 999);

      const [convRes, manualRes] = await Promise.all([
        supabase
          .from("stripe_conversions")
          .select("id, customer_email, plan_name, product_name, converted_at, mrr, mrr_net, net_amount, gross_amount, assigned_seller_id")
          .eq("is_reactivation", true)
          .gte("converted_at", from.toISOString())
          .lte("converted_at", to.toISOString())
          .order("converted_at", { ascending: false }),
        recoveryMetricIds.length
          ? supabase
              .from("tactical_manual_entries")
              .select("id, user_id, entry_date, value, mrr_value, note, metric_id")
              .in("metric_id", recoveryMetricIds)
              .gte("entry_date", toBRDateKey(from))
              .lte("entry_date", toBRDateKey(to))
              .order("entry_date", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const list: Row[] = (convRes.data || [])
        .filter((c: any) => !memberIds.length || memberIds.includes(c.assigned_seller_id))
        .map((c: any) => ({
          id: `s-${c.id}`,
          email: c.customer_email,
          name: null as string | null,
          plan: c.plan_name || c.product_name,
          date: c.converted_at,
          price: Number(c.net_amount ?? c.gross_amount ?? 0),
          mrr: Number(c.mrr_net ?? c.mrr ?? 0),
          seller_id: c.assigned_seller_id,
          origin: "stripe" as const,
          qty: 1,
        }))
        .filter((r) => r.mrr > 0);

      for (const m of (manualRes as any).data || []) {
        if (memberIds.length && !memberIds.includes(m.user_id)) continue;
        list.push({
          id: `m-${m.id}`,
          email: null,
          name: m.note || "Lançamento manual",
          plan: null,
          date: m.entry_date,
          price: 0,
          mrr: Number(m.mrr_value || 0),
          seller_id: m.user_id,
          origin: "manual",
          qty: Number(m.value || 0),
        });
      }

      const emails = Array.from(new Set(list.map((r) => r.email).filter(Boolean))) as string[];
      if (emails.length) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("name, email")
          .in("email", emails.slice(0, 500));
        const byEmail = new Map((contacts || []).map((c: any) => [String(c.email).toLowerCase(), c.name]));
        for (const r of list) {
          if (r.email) r.name = byEmail.get(r.email.toLowerCase()) ?? r.name;
        }
      }

      list.sort((a, b) => parseDateBR(b.date).getTime() - parseDateBR(a.date).getTime());

      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days, memberIds.join(","), recoveryMetricIds.join(","), today.getTime(), refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.email || "").toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.plan || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalMrr = filtered.reduce((s, r) => s + r.mrr, 0);
  const totalQty = filtered.reduce((s, r) => s + r.qty, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">
            Clientes recuperados{teamName ? ` · Time ${teamName}` : ""}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Reativações identificadas no Stripe somadas aos lançamentos manuais do time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar cliente, e-mail ou plano..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-56"
          />
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary">{totalQty} recuperados</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma recuperação no período para este time.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.name || "—"}
                      {r.origin === "manual" && (
                        <Badge variant="outline" className="ml-2">
                          Manual · {r.qty}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                    <TableCell>{r.plan || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {profiles.find((p) => p.user_id === r.seller_id)?.full_name || "—"}
                    </TableCell>
                    <TableCell>{parseDateBR(r.date).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{r.price > 0 ? fmtBRL(r.price) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{r.mrr > 0 ? fmtBRL(r.mrr) : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell colSpan={6}>Total</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalMrr)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
