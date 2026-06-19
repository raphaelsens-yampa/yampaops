import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PieChart as PieChartIcon, Download, CheckCircle2, XCircle } from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const AREA_COLORS: Record<string, string> = {
  Sales: "hsl(193 99% 44%)",
  CX: "hsl(264 90% 47%)",
  Marketing: "hsl(35 92% 55%)",
  Produto: "hsl(150 60% 45%)",
  Parceria: "hsl(280 70% 55%)",
  YampaFin: "hsl(340 75% 55%)",
  desconhecida: "hsl(220 10% 60%)",
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => s ? format(new Date(s), "dd/MM/yyyy", { locale: ptBR }) : "—";
const toIso = (d: Date) => d.toISOString().slice(0, 10);

interface Conversion {
  id: string;
  customer_email: string | null;
  area: string;
  product_name: string | null;
  plan_name: string | null;
  mrr: number;
  matched_opportunity_id: string | null;
  registered_at: string | null;
  converted_at: string;
  stripe_subscription_id: string | null;
}

const PERIOD_PRESETS = [
  { key: "this_month", label: "Este mês" },
  { key: "last_30", label: "Últimos 30 dias" },
  { key: "last_90", label: "Últimos 90 dias" },
  { key: "ytd", label: "Ano atual" },
  { key: "custom", label: "Personalizado" },
];

function presetRange(key: string): { start: string; end: string } {
  const today = new Date();
  if (key === "this_month") return { start: toIso(startOfMonth(today)), end: toIso(endOfMonth(today)) };
  if (key === "last_30") return { start: toIso(subDays(today, 30)), end: toIso(today) };
  if (key === "last_90") return { start: toIso(subDays(today, 90)), end: toIso(today) };
  if (key === "ytd") return { start: toIso(new Date(today.getFullYear(), 0, 1)), end: toIso(today) };
  return { start: toIso(subDays(today, 30)), end: toIso(today) };
}

export default function StripeConversions() {
  const { role } = useAuth();
  if (role !== "admin" && role !== "tatico") return <Navigate to="/" replace />;

  const [periodPreset, setPeriodPreset] = useState("last_90");
  const [period, setPeriod] = useState(() => presetRange("last_90"));
  const [safraEnabled, setSafraEnabled] = useState(false);
  const [safra, setSafra] = useState(() => presetRange("ytd"));
  const [areaFilter, setAreaFilter] = useState<string>("all");

  function changePreset(p: string) {
    setPeriodPreset(p);
    if (p !== "custom") setPeriod(presetRange(p));
  }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stripe-conversions", period, safraEnabled, safra, areaFilter],
    queryFn: async () => {
      let q = supabase
        .from("stripe_conversions")
        .select("id, customer_email, area, product_name, plan_name, mrr, matched_opportunity_id, registered_at, converted_at, stripe_subscription_id")
        .gte("converted_at", `${period.start}T00:00:00`)
        .lte("converted_at", `${period.end}T23:59:59`)
        .order("converted_at", { ascending: false });
      if (safraEnabled) {
        q = q.gte("registered_at", `${safra.start}T00:00:00`).lte("registered_at", `${safra.end}T23:59:59`);
      }
      if (areaFilter !== "all") q = q.eq("area", areaFilter);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return (data || []) as Conversion[];
    },
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const totalMrr = rows.reduce((s, r) => s + Number(r.mrr || 0), 0);
    const matched = rows.filter(r => r.matched_opportunity_id).length;
    const areasCount = new Set(rows.map(r => r.area)).size;
    return { total, totalMrr, matched, areasCount, ticketMedio: total ? totalMrr / total : 0 };
  }, [rows]);

  const byArea = useMemo(() => {
    const map = new Map<string, { area: string; conversoes: number; mrr: number }>();
    for (const r of rows) {
      const cur = map.get(r.area) || { area: r.area, conversoes: 0, mrr: 0 };
      cur.conversoes += 1;
      cur.mrr += Number(r.mrr || 0);
      map.set(r.area, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [rows]);

  const timeSeries = useMemo(() => {
    // group by month
    const map = new Map<string, Record<string, number> & { mes: string }>();
    for (const r of rows) {
      const d = new Date(r.converted_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = map.get(key) || ({ mes: key } as any);
      cur[r.area] = (cur[r.area] || 0) + Number(r.mrr || 0);
      cur._total = (cur._total || 0) + Number(r.mrr || 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [rows]);

  const visibleAreas = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => s.add(r.area));
    return Array.from(s);
  }, [rows]);

  function exportCSV() {
    const data = rows.map(r => ({
      Data_Conversao: fmtDate(r.converted_at),
      Data_Cadastro: fmtDate(r.registered_at),
      Area: r.area,
      Produto: r.product_name || "",
      Plano: r.plan_name || "",
      Email: r.customer_email || "",
      MRR: r.mrr,
      Matched_Deal: r.matched_opportunity_id ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conversoes");
    const buf = XLSX.write(wb, { bookType: "csv", type: "array" });
    saveAs(new Blob([buf], { type: "text/csv;charset=utf-8" }), `conversoes_stripe_${period.start}_${period.end}.csv`);
  }

  function exportXLSX() {
    const data = rows.map(r => ({
      "Data Conversão": fmtDate(r.converted_at),
      "Data Cadastro": fmtDate(r.registered_at),
      "Área": r.area,
      "Produto": r.product_name || "",
      "Plano": r.plan_name || "",
      "Email": r.customer_email || "",
      "MRR (R$)": r.mrr,
      "Match com Deal": r.matched_opportunity_id ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conversões");
    // Aba resumo por área
    const resumo = byArea.map(a => ({ "Área": a.area, "Conversões": a.conversoes, "MRR (R$)": a.mrr }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo por Área");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `conversoes_stripe_${period.start}_${period.end}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Conversões Stripe por Área`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Período: ${period.start} → ${period.end}${safraEnabled ? ` | Safra: ${safra.start} → ${safra.end}` : ""}`, 14, 24);
    doc.text(`Total: ${stats.total} conversões | MRR: ${fmtBRL(stats.totalMrr)} | Áreas: ${stats.areasCount}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [["Área", "Conversões", "MRR (R$)"]],
      body: byArea.map(a => [a.area, a.conversoes, fmtBRL(a.mrr)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [5, 32, 51] },
    });

    const startY = (doc as any).lastAutoTable?.finalY + 8 || 80;
    autoTable(doc, {
      startY,
      head: [["Data", "Cadastro", "Área", "Produto", "Plano", "Email", "MRR", "Deal"]],
      body: rows.map(r => [
        fmtDate(r.converted_at), fmtDate(r.registered_at), r.area,
        r.product_name || "", r.plan_name || "", r.customer_email || "",
        fmtBRL(Number(r.mrr || 0)), r.matched_opportunity_id ? "Sim" : "Não",
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [5, 32, 51] },
    });

    doc.save(`conversoes_stripe_${period.start}_${period.end}.pdf`);
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <PieChartIcon className="h-6 w-6 text-primary" />
              Conversões por Área
            </h1>
            <p className="text-sm text-muted-foreground">Acompanhamento de todas as conversões pagas vindas do Stripe, classificadas por área do produto.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!rows.length}>
                <Download className="h-4 w-4 mr-2" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportXLSX}>Excel (XLSX)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Período de conversão</Label>
                <Select value={periodPreset} onValueChange={changePreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {periodPreset === "custom" && (
                  <div className="flex gap-2 mt-1">
                    <Input type="date" value={period.start} onChange={e => setPeriod({ ...period, start: e.target.value })} />
                    <Input type="date" value={period.end} onChange={e => setPeriod({ ...period, end: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-2">
                  <input type="checkbox" checked={safraEnabled} onChange={e => setSafraEnabled(e.target.checked)} />
                  Filtrar por safra (data de cadastro)
                </Label>
                {safraEnabled && (
                  <div className="flex gap-2">
                    <Input type="date" value={safra.start} onChange={e => setSafra({ ...safra, start: e.target.value })} />
                    <Input type="date" value={safra.end} onChange={e => setSafra({ ...safra, end: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Área</Label>
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as áreas</SelectItem>
                    {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Conversões</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">MRR Total</p><p className="text-2xl font-bold">{fmtBRL(stats.totalMrr)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Ticket Médio</p><p className="text-2xl font-bold">{fmtBRL(stats.ticketMedio)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Match c/ Deal</p><p className="text-2xl font-bold">{stats.matched}<span className="text-sm text-muted-foreground"> / {stats.total}</span></p></CardContent></Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Distribuição por Área (Conversões)</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byArea} dataKey="conversoes" nameKey="area" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label>
                    {byArea.map((e) => <Cell key={e.area} fill={AREA_COLORS[e.area as Area] || "hsl(220 10% 60%)"} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v} conversões`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">MRR por Área</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byArea}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="area" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                  <Bar dataKey="mrr" radius={[6,6,0,0]}>
                    {byArea.map((e) => <Cell key={e.area} fill={AREA_COLORS[e.area as Area] || "hsl(220 10% 60%)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Evolução do MRR no tempo (por área)</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                <Legend />
                {visibleAreas.map(a => (
                  <Line key={a} type="monotone" dataKey={a} stroke={AREA_COLORS[a as Area] || "hsl(220 10% 60%)"} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhamento</CardTitle>
            <CardDescription>{rows.length} conversões no período selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conversão</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Produto / Plano</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-center">Deal?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhuma conversão no período.</TableCell></TableRow>
                  )}
                  {rows.slice(0, 500).map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{fmtDate(r.converted_at)}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(r.registered_at)}</TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: AREA_COLORS[r.area as Area] || "hsl(220 10% 60%)", color: "white" }}>
                          {r.area}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.product_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.plan_name || ""}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.customer_email || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(Number(r.mrr || 0))}</TableCell>
                      <TableCell className="text-center">
                        {r.matched_opportunity_id
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                          : <XCircle className="h-4 w-4 text-muted-foreground inline" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 500 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">Exibindo as 500 conversões mais recentes. Exporte para ver todas.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
