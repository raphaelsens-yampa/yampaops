import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DailyDatum,
  TacticalGoal,
  TacticalMetric,
  formatMetric,
  realizedBetween,
  resolveDailyTarget,
  toBRDateKey,
  weeksOfMonth,
} from "./types";
import type { LowTouchSale } from "./useLowTouchData";

interface Props {
  metrics?: TacticalMetric[];
  goals?: TacticalGoal[];
  daily?: DailyDatum[];
  memberIds?: string[];
  teamId?: string | null;
  today: Date;
  /** Modo Low-touch: sem metas cadastradas, apenas realizado por semana. */
  lowTouchSales?: LowTouchSale[];
}

interface Row {
  key: string;
  label: string;
  rangeLabel: string;
  businessDays: number;
  target: number | null;
  realized: number | null;
  isCurrent: boolean;
  isFuture: boolean;
}

const LT_MRR = "__lt_mrr__";
const LT_COUNT = "__lt_count__";

export function WeeklyGoalsPanel({
  metrics = [],
  goals = [],
  daily = [],
  memberIds = [],
  teamId = null,
  today,
  lowTouchSales,
}: Props) {
  const isLowTouch = Array.isArray(lowTouchSales);

  const visible = useMemo(
    () => metrics.filter((m) => m.key !== "call_realizada"),
    [metrics],
  );
  const defaultMetricId = useMemo(() => {
    if (isLowTouch) return LT_MRR;
    return visible.find((m) => m.key === "vendas_dia")?.id ?? visible[0]?.id ?? "";
  }, [visible, isLowTouch]);
  const [metricId, setMetricId] = useState<string>(defaultMetricId);

  const selected = isLowTouch
    ? metricId === LT_COUNT
      ? LT_COUNT
      : LT_MRR
    : metricId || defaultMetricId;

  const metric = isLowTouch ? undefined : visible.find((m) => m.id === selected) ?? visible[0];
  const unit: "count" | "currency" = isLowTouch
    ? selected === LT_COUNT
      ? "count"
      : "currency"
    : metric?.unit ?? "count";

  const weeks = useMemo(() => weeksOfMonth(today), [today]);
  const todayKey = toBRDateKey(today);

  const rows: Row[] = useMemo(() => {
    const users = memberIds.length
      ? memberIds
      : Array.from(new Set(daily.map((d) => d.user_id)));
    const dailyTargetTotal =
      !isLowTouch && metric
        ? users.reduce((s, uid) => s + resolveDailyTarget(goals, metric.id, uid, teamId), 0)
        : 0;

    return weeks.map((w) => {
      const startKey = toBRDateKey(w.start);
      const endKey = toBRDateKey(w.end);
      const isCurrent = todayKey >= startKey && todayKey <= endKey;
      const isFuture = startKey > todayKey;

      let realized: number | null = null;
      if (!isFuture) {
        if (isLowTouch) {
          const sales = (lowTouchSales ?? []).filter(
            (s) => s.dateKey >= startKey && s.dateKey <= endKey,
          );
          realized =
            selected === LT_COUNT
              ? sales.length
              : sales.reduce((s, x) => s + (x.mrr ?? 0), 0);
        } else if (metric) {
          realized = realizedBetween(daily, metric.id, users, w.start, w.end);
        } else {
          realized = 0;
        }
      }

      const target =
        isLowTouch || !dailyTargetTotal ? null : dailyTargetTotal * w.businessDays;

      return {
        key: `${w.index}-${startKey}`,
        label: w.label,
        rangeLabel: w.rangeLabel,
        businessDays: w.businessDays,
        target,
        realized,
        isCurrent,
        isFuture,
      };
    });
  }, [weeks, memberIds, daily, goals, teamId, metric, isLowTouch, lowTouchSales, selected, todayKey]);

  const totals = useMemo(() => {
    const businessDays = rows.reduce((s, r) => s + r.businessDays, 0);
    const hasTarget = rows.some((r) => r.target !== null);
    const target = hasTarget ? rows.reduce((s, r) => s + (r.target ?? 0), 0) : null;
    const realized = rows.reduce((s, r) => s + (r.realized ?? 0), 0);
    return { businessDays, target, realized };
  }, [rows]);

  const pctOf = (r: { target: number | null; realized: number | null }) =>
    r.target && r.target > 0 && r.realized !== null ? (r.realized / r.target) * 100 : null;

  const gapOf = (r: { target: number | null; realized: number | null }) =>
    r.target !== null && r.realized !== null ? r.realized - r.target : null;

  const gapText = (gap: number | null) => {
    if (gap === null) return "—";
    const abs = formatMetric(Math.abs(gap), unit);
    return gap >= 0 ? `+${abs}` : `-${abs}`;
  };

  const monthLabel = format(today, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3 px-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base">Metas semanais do mês</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{monthLabel}</p>
          </div>
          <Select value={selected} onValueChange={setMetricId}>
            <SelectTrigger className="h-10 md:h-9 md:w-52">
              <SelectValue placeholder="Métrica" />
            </SelectTrigger>
            <SelectContent>
              {isLowTouch ? (
                <>
                  <SelectItem value={LT_MRR}>MRR Low-touch</SelectItem>
                  <SelectItem value={LT_COUNT}>Vendas Low-touch</SelectItem>
                </>
              ) : (
                visible.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-4 md:px-6">
        {/* Mobile: cards */}
        <div className="space-y-2 md:hidden">
          {rows.map((r) => {
            const pct = pctOf(r);
            const gap = gapOf(r);
            return (
              <div
                key={r.key}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  r.isCurrent && "border-primary/50 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.rangeLabel}</span>
                    {r.isCurrent && <Badge variant="secondary" className="text-[10px]">atual</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{r.businessDays} d.ú.</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    <span className="font-semibold">
                      {r.realized === null ? "—" : formatMetric(r.realized, unit)}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}/ {r.target === null ? "—" : formatMetric(r.target, unit)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      gap === null ? "text-muted-foreground" : gap >= 0 ? "text-emerald-600" : "text-destructive",
                    )}
                  >
                    {gap === null ? "—" : gap >= 0 ? `excedente ${formatMetric(gap, unit)}` : `falta ${formatMetric(Math.abs(gap), unit)}`}
                  </span>
                </div>
                {pct !== null && <Progress value={Math.min(pct, 100)} className="h-1.5" />}
              </div>
            );
          })}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium py-2">Semana</th>
                <th className="text-left font-medium py-2">Período</th>
                <th className="text-right font-medium py-2">Dias úteis</th>
                <th className="text-right font-medium py-2">Meta</th>
                <th className="text-right font-medium py-2">Realizado</th>
                <th className="text-right font-medium py-2">%</th>
                <th className="text-right font-medium py-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = pctOf(r);
                const gap = gapOf(r);
                return (
                  <tr
                    key={r.key}
                    className={cn("border-b last:border-0", r.isCurrent && "bg-primary/5 font-medium")}
                  >
                    <td className="py-2">
                      {r.label}
                      {r.isCurrent && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">atual</Badge>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">{r.rangeLabel}</td>
                    <td className="py-2 text-right">{r.businessDays}</td>
                    <td className="py-2 text-right">
                      {r.target === null ? "—" : formatMetric(r.target, unit)}
                    </td>
                    <td className="py-2 text-right">
                      {r.realized === null ? "—" : formatMetric(r.realized, unit)}
                    </td>
                    <td className="py-2 text-right">{pct === null ? "—" : `${pct.toFixed(0)}%`}</td>
                    <td
                      className={cn(
                        "py-2 text-right",
                        gap === null ? "text-muted-foreground" : gap >= 0 ? "text-emerald-600" : "text-destructive",
                      )}
                    >
                      {gapText(gap)}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td />
                <td className="py-2 text-right">{totals.businessDays}</td>
                <td className="py-2 text-right">
                  {totals.target === null ? "—" : formatMetric(totals.target, unit)}
                </td>
                <td className="py-2 text-right">{formatMetric(totals.realized, unit)}</td>
                <td className="py-2 text-right">
                  {totals.target && totals.target > 0
                    ? `${((totals.realized / totals.target) * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td
                  className={cn(
                    "py-2 text-right",
                    totals.target === null
                      ? "text-muted-foreground"
                      : totals.realized - totals.target >= 0
                        ? "text-emerald-600"
                        : "text-destructive",
                  )}
                >
                  {totals.target === null ? "—" : gapText(totals.realized - totals.target)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {!isLowTouch && rows.every((r) => r.target === null) && (
          <p className="text-xs text-muted-foreground mt-3">
            Sem meta diária cadastrada para esta métrica no escopo atual — exibindo apenas o realizado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
