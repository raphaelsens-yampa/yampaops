import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OpType = "Nova Venda" | "Recuperado" | "Upsell" | "Churn" | "Downsell";
interface Row { key: string; client: string; plan: string; date: string; type: OpType; channel: string; seller: string; value: number }

const CLASS_MAP: Record<string, OpType> = { "novo pagante": "Nova Venda", recuperado: "Recuperado", upsell: "Upsell", downsell: "Downsell" };
const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export function OperationalMonthReport({ area, monthStartKey, monthEndKey }: { area: "sales" | "cs"; monthStartKey: string; monthEndKey: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const classes = area === "sales" ? ["novo pagante", "recuperado", "upsell"] : ["downsell"];
      const nextMonth = new Date(Number(monthStartKey.slice(0, 4)), Number(monthStartKey.slice(5, 7)), 1);
      const snapEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-05`;
      const { data: ativos } = await fetchAllPaged<any>(() =>
        supabase.from("metas_ativos_pagantes_daily")
          .select("id, email, plano, nome_oferta, mrr, previous_mrr, origem_cliente, data_inicio, classificacao_company, data_snapshot")
          .in("classificacao_company", classes)
          .gte("data_inicio", monthStartKey).lte("data_inicio", monthEndKey)
          .gte("data_snapshot", monthStartKey).lte("data_snapshot", snapEnd)
          .order("id") as any);

      const latest = new Map<string, any>();
      for (const r of ativos) {
        const k = `${String(r.email).toLowerCase()}|${r.classificacao_company}|${r.plano}`;
        const cur = latest.get(k);
        if (!cur || r.data_snapshot > cur.data_snapshot) latest.set(k, r);
      }
      const base: Omit<Row, "seller">[] = [];
      latest.forEach((r, k) => {
        const type = CLASS_MAP[r.classificacao_company];
        const mrr = Number(r.mrr || 0), prev = Number(r.previous_mrr || 0);
        const value = type === "Upsell" ? Math.max(mrr - prev, 0) : type === "Downsell" ? Math.max(prev - mrr, 0) : mrr;
        if (value <= 0) return;
        base.push({ key: k, client: r.email, plan: r.plano || r.nome_oferta || "—", date: r.data_inicio, type, channel: r.origem_cliente || "—", value });
      });

      if (area === "cs") {
        const { data: churns } = await fetchAllPaged<any>(() =>
          supabase.from("metas_churn_daily")
            .select("id, email, plano, nome_oferta, origem_cliente, churn_at, data_ref_churn, total_mrr")
            .eq("mes_ref_data", monthStartKey).order("id") as any);
        const seen = new Map<string, any>();
        for (const c of churns) {
          const d = String(c.churn_at || c.data_ref_churn || "").slice(0, 10);
          if (!d || d < monthStartKey || d > monthEndKey) continue;
          const k = `${String(c.email).toLowerCase()}|churn|${d}`;
          if (!seen.has(k)) seen.set(k, { ...c, d });
        }
        seen.forEach((c, k) => {
          const value = Number(c.total_mrr || 0);
          if (value > 0) base.push({ key: k, client: c.email, plan: c.plano || c.nome_oferta || "—", date: c.d, type: "Churn", channel: c.origem_cliente || "—", value });
        });
      }

      const emails = [...new Set(base.map((b) => String(b.client).toLowerCase()))];
      const sellerByEmail = new Map<string, string>();
      for (let i = 0; i < emails.length; i += 200) {
        const { data } = await fetchAllPaged<any>(() => supabase.from("stripe_conversions")
          .select("id, customer_email, assigned_seller_id, converted_at")
          .in("customer_email", emails.slice(i, i + 200)).not("assigned_seller_id", "is", null)
          .order("converted_at", { ascending: true }).order("id") as any);
        (data || []).forEach((c: any) => sellerByEmail.set(String(c.customer_email).toLowerCase(), c.assigned_seller_id));
      }
      const ids = [...new Set(sellerByEmail.values())];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        (data || []).forEach((p: any) => names.set(p.user_id, p.full_name));
      }
      const out: Row[] = base.map((b) => {
        const sid = sellerByEmail.get(String(b.client).toLowerCase());
        return { ...b, seller: (sid && names.get(sid)) || "—" };
      }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.value - a.value));
      if (!cancelled) { setRows(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [area, monthStartKey, monthEndKey]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows]);

  return (
    <Card className="mt-6 overflow-hidden rounded-lg">
      <CardHeader className="border-b px-4 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Relatório do mês</p>
        <h3 className="font-heading text-lg font-bold">Operações {area === "sales" ? "de New MRR" : "de Churn MRR"}</h3>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando operações…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma operação registrada neste mês.</p>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Data da Operação</TableHead>
                  <TableHead>Tipo da Operação</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Valor do MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="max-w-56 truncate" title={r.client}>{r.client}</TableCell>
                    <TableCell>{r.plan}</TableCell>
                    <TableCell>{br(r.date)}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell className="capitalize">{r.channel}</TableCell>
                    <TableCell>{r.seller}</TableCell>
                    <TableCell className="text-right font-medium">{money(r.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6}>{rows.length} operações</TableCell>
                  <TableCell className="text-right font-bold">{money(total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
