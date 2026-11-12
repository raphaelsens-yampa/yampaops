import { useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DailyChartRow } from "@/lib/operationalDailyChart";

type Props = {
  title: string;
  mrrRows: DailyChartRow[];
  countRows?: DailyChartRow[];
  lowerIsBetter: boolean;
};

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const qty = (v: number) => Math.round(v).toLocaleString("pt-BR");

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border p-0.5">
      {options.map(([k, l]) => (
        <Button key={k} size="sm" variant="ghost" onClick={() => onChange(k)} className={cn("h-7 px-3 text-xs", value === k && "bg-muted font-semibold")}>{l}</Button>
      ))}
    </div>
  );
}

export function OperationalDailyChart({ title, mrrRows, countRows, lowerIsBetter }: Props) {
  const [mode, setMode] = useState<"daily" | "cum">("daily");
  const [metric, setMetric] = useState<"mrr" | "count">("mrr");
  const useCount = metric === "count" && !!countRows;
  const rows = useCount ? countRows! : mrrRows;
  const fmt = useCount ? qty : money;
  const realizedKey = mode === "daily" ? "realized" : "cumRealized";
  const targetKey = mode === "daily" ? "target" : "cumTarget";

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="font-heading text-base">{title} — Meta x Realizado por dia</CardTitle>
        <div className="flex flex-wrap gap-2">
          {countRows && <Toggle<"mrr" | "count"> value={metric} onChange={setMetric} options={[["mrr", "MRR"], ["count", "Qtd. vendas"]] as ["mrr" | "count", string][]} />}
          <Toggle<"daily" | "cum"> value={mode} onChange={setMode} options={[["daily", "Diário"], ["cum", "Acumulado"]] as ["daily" | "cum", string][]} />
        </div>
      </CardHeader>
      <CardContent className="h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={0} />
            <YAxis width={70} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmt(Number(v))} allowDecimals={!useCount} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as DailyChartRow;
                const t = r[targetKey as "target"] ;
                const v = r[realizedKey as "realized"];
                const diff = t !== null && v !== null ? v - t : null;
                return (
                  <div className="rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow">
                    <p className="mb-1 font-semibold">{r.day.split("-").reverse().join("/")}</p>
                    <p>Meta: {t === null ? "—" : fmt(t)}</p>
                    <p>Realizado: {v === null ? "—" : fmt(v)}</p>
                    {diff !== null && <p>Diferença: {diff >= 0 ? "+" : ""}{fmt(diff)}</p>}
                    {t ? v !== null && <p>{((v / t) * 100).toFixed(0)}% da meta</p> : null}
                  </div>
                );
              }}
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {mode === "daily" ? (
              <Bar dataKey="realized" name="Realizado" radius={[3, 3, 0, 0]}>
                {rows.map((r) => (
                  <Cell key={r.day} fill={r.hit === null ? "hsl(var(--primary))" : r.hit ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                ))}
              </Bar>
            ) : (
              <Line dataKey="cumRealized" name="Realizado acumulado" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} connectNulls={false} />
            )}
            <Line dataKey={targetKey} name={mode === "daily" ? "Meta do dia" : "Meta acumulada"} stroke="hsl(var(--secondary))" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} type="linear" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="sr-only">{lowerIsBetter ? "Abaixo da meta é bom" : "Acima da meta é bom"}</p>
      </CardContent>
    </Card>
  );
}
