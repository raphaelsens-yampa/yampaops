import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { stripeConversionOrigin } from "@/lib/origins";
import { type ChurnCase } from "@/lib/churnAnalysis";
import { matchSales, groupOutcomes, cohortByMonth, type ChurnGroup, type SaleOutcome } from "@/lib/sellerChurn";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const todaySP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

type SortKey = keyof Pick<ChurnGroup, "vendas" | "mrrVendido" | "churns" | "taxa" | "mrrPerdido" | "pctMrrPerdido" | "diasMedio" | "precoce">;

function GroupTable({ title, rows }: { title: string; rows: ChurnGroup[] }) {
  const [sort, setSort] = useState<SortKey>("taxa");
  const sorted = [...rows].sort((a, b) => Number(b[sort] ?? -1) - Number(a[sort] ?? -1));
  const cols: [SortKey, string][] = [["vendas", "Vendas"], ["mrrVendido", "MRR vendido"], ["churns", "Churns"], ["taxa", "Taxa churn"], ["mrrPerdido", "MRR perdido"], ["pctMrrPerdido", "% MRR perdido"], ["diasMedio", "Dias até churn"], ["precoce", "Churn ≤90d"]];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={sorted.filter((r) => !r.amostraPequena).slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="key" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => pct(v)} />
              <Bar dataKey="taxa" name="Taxa de churn" fill="hsl(var(--destructive))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead>
            {cols.map(([k, l]) => (
              <TableHead key={k} className="cursor-pointer text-right" onClick={() => setSort(k)}>{l}{sort === k ? " ↓" : ""}</TableHead>
            ))}
            <TableHead className="text-right">Recuperados</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.key} {r.amostraPequena && <Badge variant="outline" className="ml-1 text-[10px]">amostra pequena</Badge>}</TableCell>
                <TableCell className="text-right">{r.vendas}</TableCell>
                <TableCell className="text-right">{brl(r.mrrVendido)}</TableCell>
                <TableCell className="text-right">{r.churns}</TableCell>
                <TableCell className="text-right font-semibold">{pct(r.taxa)}</TableCell>
                <TableCell className="text-right">{brl(r.mrrPerdido)}</TableCell>
                <TableCell className="text-right">{pct(r.pctMrrPerdido)}</TableCell>
                <TableCell className="text-right">{r.diasMedio ?? "—"}</TableCell>
                <TableCell className="text-right">{r.precoce}</TableCell>
                <TableCell className="text-right">{r.recuperados}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function SellerChurnTab() {
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(todaySP());
  const [area, setArea] = useState("all");
  const [seller, setSeller] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [withUpsell, setWithUpsell] = useState(true);

  const q = useQuery({
    queryKey: ["seller-churn", from, to],
    queryFn: async () => {
      const [sales, churns, profiles] = await Promise.all([
        fetchAllPaged<any>(() => supabase.from("stripe_conversions")
          .select("id, customer_email, assigned_seller_id, area, converted_at, mrr, mrr_net, conversion_type, origem_cliente, attribution_source")
          .eq("payment_status", "paid").in("conversion_type", ["new", "upsell"])
          .gte("converted_at", `${from}T00:00:00-03:00`).lte("converted_at", `${to}T23:59:59-03:00`).order("converted_at").order("id")),
        fetchAllPaged<ChurnCase>(() => (supabase as any).rpc("churn_analysis_cases", { p_from: from, p_to: todaySP() }).order("data_ref").order("id")),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      if (sales.error) throw new Error(sales.error);
      if (churns.error) throw new Error(churns.error);
      return { sales: sales.data, churns: churns.data, names: new Map((profiles.data || []).map((p: any) => [p.user_id, p.full_name || "Sem nome"])) };
    },
  });

  const outcomes = useMemo<SaleOutcome[]>(() => {
    if (!q.data) return [];
    const sales = q.data.sales.map((s: any) => ({
      ...s, mrr: Number(s.mrr_net ?? s.mrr ?? 0), origem: stripeConversionOrigin(s),
    }));
    const churns = q.data.churns.map((c) => ({
      email: c.email, date: c.future_churn_at || c.final_vigencia || c.data_ref, mrr: Number(c.mrr || 0), motivo: c.motivo, desfecho: c.desfecho,
    }));
    return matchSales(sales, churns, (id) => q.data!.names.get(id!) || "Vendedor sem perfil");
  }, [q.data]);

  const filtered = outcomes.filter((r) =>
    (withUpsell || r.conversion_type === "new") && (area === "all" || r.areaLabel === area)
    && (seller === "all" || r.seller === seller) && (origin === "all" || r.origem === origin));
  const areas = [...new Set(outcomes.map((r) => r.areaLabel))].sort();
  const sellers = [...new Set(outcomes.map((r) => r.seller))].sort();
  const total = groupOutcomes(filtered, () => "t")[0];
  const bySeller = groupOutcomes(filtered, (r) => r.seller);
  const byArea = groupOutcomes(filtered, (r) => r.areaLabel);
  const cohort = cohortByMonth(filtered).map((c) => ({ ...c, mes: `${c.key.slice(5)}/${c.key.slice(2, 4)}` }));
  const churned = filtered.filter((r) => r.churned);

  const exportCsv = () => {
    const head = ["cliente", "vendedor", "area", "tipo", "data_venda", "mrr_venda", "churn", "data_churn", "mrr_perdido", "dias_ate_churn", "motivo", "recuperado"];
    const lines = filtered.map((r) => [r.email, r.seller, r.areaLabel, r.conversion_type, r.converted_at.slice(0, 10), r.mrr, r.churned ? "sim" : "nao", r.churnDate ?? "", r.churnMrr, r.daysToChurn ?? "", r.motivo ?? "", r.recovered ? "sim" : "nao"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["\ufeff" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `churn-por-vendedor_${from}_${to}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div><Label>Vendas de</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="w-44"><Label>Área</Label>
            <Select value={area} onValueChange={setArea}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
          <div className="w-52"><Label>Vendedor</Label>
            <Select value={seller} onValueChange={setSeller}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{sellers.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
          <div className="w-36"><Label>Origem</Label>
            <Select value={origin} onValueChange={setOrigin}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Geral</SelectItem><SelectItem value="yampa">Yampa</SelectItem><SelectItem value="4blue">4blue</SelectItem></SelectContent></Select></div>
          <div className="flex items-center gap-2 pb-2"><Switch checked={withUpsell} onCheckedChange={setWithUpsell} id="up" /><Label htmlFor="up">Incluir upsell</Label></div>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="mr-2 h-4 w-4" />CSV</Button>
        </CardContent>
      </Card>

      {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : q.error ? <p className="text-sm text-destructive">{String((q.error as Error).message)}</p> : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[["Vendas no período", String(total?.vendas ?? 0)], ["Clientes que deram churn", String(total?.churns ?? 0)], ["Taxa de churn da safra", pct(total?.taxa ?? 0)], ["MRR vendido × perdido", `${brl(total?.mrrVendido ?? 0)} × ${brl(total?.mrrPerdido ?? 0)}`]].map(([l, v]) => (
              <Card key={l}><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Churn = o mesmo cliente cancelou depois da data da venda (clientes revertidos contam como recuperados). Vendas sem vendedor atribuído aparecem como "Sem vendedor". Grupos com menos de 10 vendas ficam fora do gráfico.</p>
          <GroupTable title="Churn por vendedor" rows={bySeller} />
          <GroupTable title="Churn por área" rows={byArea} />
          <Card>
            <CardHeader><CardTitle className="text-base">Safra por mês de venda</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={cohort}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: number, n) => (n === "Taxa de churn" ? pct(v) : v)} />
                  <Bar dataKey="taxa" name="Taxa de churn" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Vendas que viraram churn ({churned.length})</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead>Área</TableHead><TableHead>Venda</TableHead><TableHead>Churn</TableHead><TableHead className="text-right">Dias</TableHead><TableHead className="text-right">MRR</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {churned.sort((a, b) => (a.daysToChurn ?? 0) - (b.daysToChurn ?? 0)).map((r, i) => (
                    <TableRow key={i}><TableCell>{r.email}</TableCell><TableCell>{r.seller}</TableCell><TableCell>{r.areaLabel}</TableCell><TableCell>{br(r.converted_at)}</TableCell><TableCell>{br(r.churnDate)}</TableCell><TableCell className="text-right">{r.daysToChurn}</TableCell><TableCell className="text-right">{brl(r.churnMrr)}</TableCell><TableCell>{r.motivo || "—"}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
