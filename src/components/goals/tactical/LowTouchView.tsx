import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Vendas Low-touch do dia</p>
            <p className="text-3xl font-semibold mt-1">{todayCount}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Média dos últimos 30 dias: {avg30.count.toFixed(1)}/dia
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">MRR Low-touch do dia</p>
            <p className="text-3xl font-semibold mt-1">{fmtBRL(todayMrr)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Média dos últimos 30 dias: {fmtBRL(avg30.mrr)}/dia
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Evolução acumulada — Low-touch</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Sem meta diária cadastrada — apenas realizado acumulado no período.
            </p>
          </div>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  width={70}
                  tickFormatter={(v) => fmtBRL(Number(v))}
                />
                <Tooltip
                  formatter={(v: any, name: any) =>
                    name === "MRR acumulado" ? [fmtBRL(Number(v)), name] : [Number(v).toLocaleString("pt-BR"), name]
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="left" type="monotone" dataKey="vendas" name="Vendas acumuladas"
                  stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false}
                />
                <Line
                  yAxisId="right" type="monotone" dataKey="mrr" name="MRR acumulado"
                  stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Ranking por área</CardTitle>
          <Badge variant="secondary">{totalCount} vendas</Badge>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma venda Low-touch no período.
            </p>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
