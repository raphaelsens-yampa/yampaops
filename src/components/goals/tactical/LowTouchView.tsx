import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapseToggle } from "./CollapseToggle";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toBRDateKey } from "./types";
import type { LowTouchSale } from "./useLowTouchData";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

interface Props {
  sales: LowTouchSale[];
  today: Date;
}

export function LowTouchView({ sales, today }: Props) {
  const [preset, setPreset] = useState("30");
  const [chartOpen, setChartOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const todayKey = toBRDateKey(today);

  const todaySales = useMemo(() => sales.filter((s) => s.dateKey === todayKey), [sales, todayKey]);
  const todayCount = todaySales.length;
  const todayMrr = todaySales.reduce((s, r) => s + r.mrr, 0);

  const avg30 = useMemo(() => {
    const start = new Date(today); start.setDate(start.getDate() - 29);
    const startKey = toBRDateKey(start);
    const window = sales.filter((s) => s.dateKey >= startKey && s.dateKey <= todayKey);
    return { count: window.length / 30, mrr: window.reduce((s, r) => s + r.mrr, 0) / 30 };
  }, [sales, today, todayKey]);

  const { from, to } = useMemo(() => {
    const end = new Date(today); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (Number(preset) - 1));
    return { from: start, to: end };
  }, [preset, today]);

  const periodSales = useMemo(() => {
    const a = toBRDateKey(from);
    const b = toBRDateKey(to);
    return sales.filter((s) => s.dateKey >= a && s.dateKey <= b);
  }, [sales, from, to]);

  const monthToDate = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const startKey = toBRDateKey(start);
    const window = sales.filter((s) => s.dateKey >= startKey && s.dateKey <= todayKey);
    return { count: window.length, mrr: window.reduce((s, r) => s + r.mrr, 0) };
  }, [sales, today, todayKey]);

  const chartData = useMemo(() => {
    const points: { label: string; vendas: number; mrr: number }[] = [];
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(0, 0, 0, 0);
    while (d <= end) {
      const key = toBRDateKey(d);
      const day = periodSales.filter((s) => s.dateKey === key);
      points.push({
        label: format(d, "dd/MM", { locale: ptBR }),
        vendas: day.length,
        mrr: day.reduce((s, r) => s + r.mrr, 0),
      });
      d.setDate(d.getDate() + 1);
    }
    return points;
  }, [periodSales, from, to]);

  const ranking = useMemo(() => {
    const map = new Map<string, { area: string; count: number; mrr: number }>();
    for (const s of periodSales) {
      const cur = map.get(s.area) ?? { area: s.area, count: 0, mrr: 0 };
      cur.count += 1;
      cur.mrr += s.mrr;
      map.set(s.area, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [periodSales]);

  const totalMrr = ranking.reduce((s, r) => s + r.mrr, 0);
  const totalCount = ranking.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Vendas Low-touch do dia</p>
            <p className="text-2xl sm:text-3xl font-semibold mt-1">{todayCount}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-2">
              Média 30d: {avg30.count.toFixed(1)}/dia
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">MRR Low-touch do dia</p>
            <p className="text-2xl sm:text-3xl font-semibold mt-1">{fmtBRL(todayMrr)}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-2">
              Média 30d: {fmtBRL(avg30.mrr)}/dia
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Vendas acum. Low-touch (mês)</p>
            <p className="text-2xl sm:text-3xl font-semibold mt-1">{monthToDate.count}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-2">
              {format(today, "MMMM 'de' yyyy", { locale: ptBR })} até hoje
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">MRR acum. Low-touch (mês)</p>
            <p className="text-2xl sm:text-3xl font-semibold mt-1">{fmtBRL(monthToDate.mrr)}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-2">
              {format(today, "MMMM 'de' yyyy", { locale: ptBR })} até hoje
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 px-4 md:px-6 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex items-center gap-1">
            <CollapseToggle open={chartOpen} onToggle={() => setChartOpen((v) => !v)} />
            <div>
            <CardTitle className="text-sm sm:text-base">Conversão diária — Low-touch</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Vendas e MRR realizados por dia no período selecionado.
            </p>
            </div>
          </div>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="h-10 md:h-9 md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        {chartOpen && (
        <CardContent className="px-2 sm:px-4 md:px-6">
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  width={56}
                  tickFormatter={(v) => fmtBRL(Number(v))}
                />
                <Tooltip
                  formatter={(v: any, name: any) =>
                    name === "MRR do dia" ? [fmtBRL(Number(v)), name] : [Number(v).toLocaleString("pt-BR"), name]
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="vendas" name="Vendas do dia" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="mrr" name="MRR do dia" fill="hsl(38 92% 50%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3 px-4 md:px-6 flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <CollapseToggle open={rankOpen} onToggle={() => setRankOpen((v) => !v)} />
            <CardTitle className="text-sm sm:text-base">Ranking por área</CardTitle>
          </div>
          <Badge variant="secondary">{totalCount} vendas</Badge>
        </CardHeader>
        {rankOpen && (
        <CardContent className="px-2 sm:px-4 md:px-6">
          {ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma venda Low-touch no período.
            </p>
          ) : (
            <div className="overflow-x-auto">
            <Table>

              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">% do MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((r) => (
                  <TableRow key={r.area}>
                    <TableCell className="font-medium">{r.area}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.mrr)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {totalMrr > 0 ? `${((r.mrr / totalMrr) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalCount}</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalMrr)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            </div>

          )}
        </CardContent>
        )}
      </Card>
    </div>
  );
}
