import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapseToggle } from "@/components/goals/tactical/CollapseToggle";
import {
  buildPaybackProjection,
  formatBRL,
  type LifetimeMonthPoint,
} from "@/lib/campaignCohort";

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTHS_PT[(month || 1) - 1]}/${String(year).slice(-2)}`;
}

function axisMoney(value: number) {
  if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return formatBRL(value);
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number;
  payload?: { month_index: number; month_key: string; investment: number };
}

function PaybackTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const actual = payload.find((item) => item.dataKey === "actual")?.value;
  const projected = payload.find((item) => item.dataKey === "projected")?.value;
  return (
    <div className="rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">M{point.month_index} · {monthLabel(point.month_key)}</p>
      {actual != null ? <p>Receita acumulada real: {formatBRL(actual)}</p> : null}
      {actual == null && projected != null ? <p>Receita acumulada prevista: {formatBRL(projected)}</p> : null}
      <p className="text-muted-foreground">Investimento: {formatBRL(point.investment)}</p>
    </div>
  );
}

export function PaybackEvolutionChart({
  monthly,
  investment,
  activeMrr,
}: {
  monthly: LifetimeMonthPoint[];
  investment: number | null;
  activeMrr: number;
}) {
  const [open, setOpen] = useState(true);
  const projection = useMemo(
    () => buildPaybackProjection(monthly, investment, activeMrr),
    [monthly, investment, activeMrr],
  );
  const milestone = projection.milestone;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Evolução do payback</CardTitle>
          {milestone ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {milestone.projected ? "Payback previsto" : "Payback atingido"} em M{milestone.offset} · {monthLabel(milestone.month_key)}
            </p>
          ) : null}
        </div>
        <CollapseToggle open={open} onToggle={() => setOpen((current) => !current)} />
      </CardHeader>
      {open ? (
        <CardContent>
          {projection.status === "invalid_investment" ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cadastre o investimento realizado para calcular o payback.</p>
          ) : projection.status === "no_active_mrr" && !projection.points.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há receita mensal suficiente para montar a evolução.</p>
          ) : (
            <>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projection.points} margin={{ top: 22, right: 30, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="month_index"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `M${value}`}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={axisMoney} width={74} />
                    <Tooltip content={<PaybackTooltip />} />
                    <Legend />
                    <ReferenceLine
                      y={Number(investment)}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="5 4"
                      label={{ value: "Investimento", position: "insideTopRight", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Receita acumulada real"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      name="Expectativa"
                      stroke="hsl(var(--secondary))"
                      strokeWidth={2}
                      strokeDasharray="7 5"
                      dot={false}
                      connectNulls={false}
                    />
                    {milestone ? (
                      <ReferenceDot
                        x={milestone.offset}
                        y={milestone.value}
                        r={6}
                        fill="hsl(var(--success))"
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                        label={{
                          value: milestone.projected ? "Payback previsto" : "Payback atingido",
                          position: "top",
                          fill: "hsl(var(--foreground))",
                          fontSize: 11,
                        }}
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {projection.status === "no_active_mrr" ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Sem MRR ativo para projetar quando o investimento será recuperado.
                </p>
              ) : projection.status === "projected" ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Expectativa calculada repetindo o MRR ativo atual de {formatBRL(activeMrr)} por mês.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}