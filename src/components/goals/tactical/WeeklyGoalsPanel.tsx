import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeRevisedWeeklyTargets, type WeekStatus } from "@/lib/revisedGoals";
import { cn } from "@/lib/utils";
import {
  businessDaysBetween,
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
import {
  VIRTUAL_MRR_SALES,
  VIRTUAL_MRR_RECOVERY,
  VIRTUAL_MRR_RETENTION,
  VIRTUAL_MRR_UPSELL,
  VIRTUAL_MRR_RECOVERED_FT,
} from "./useTacticalData";
import { useCategoryWeeklyData } from "./useCategoryWeeklyData";

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
  /** Metas/realizados financeiros (R$) da semana. */
  finTarget: number | null;
  finRealized: number | null;
  isCurrent: boolean;
  isFuture: boolean;
  /** Diferença entre meta revisada e original (só semanas futuras). */
  targetDelta?: number | null;
  finTargetDelta?: number | null;
}

const LT_MRR = "__lt_mrr__";
const REVISED_KEY = "tactical_weekly_revised_v1";
const LT_COUNT = "__lt_count__";
const ALL = "__all__";

export function WeeklyGoalsPanel({
  metrics = [],
  goals = [],
  daily = [],
  memberIds = [],
  teamId = null,
  today,
  lowTouchSales,
}: Props) {
  const [open, setOpen] = useState(true);
  const isLowTouch = Array.isArray(lowTouchSales);


  const visible = useMemo(
    () => metrics.filter((m) => m.key !== "call_realizada"),
    [metrics],
  );
  const defaultMetricId = useMemo(() => {
    if (isLowTouch) return LT_MRR;
    return visible.length ? ALL : "";
  }, [visible, isLowTouch]);
  const [metricId, setMetricId] = useState<string>(defaultMetricId);

  const selected = isLowTouch
    ? metricId === LT_COUNT
      ? LT_COUNT
      : LT_MRR
    : metricId || defaultMetricId;

  const isAll = !isLowTouch && selected === ALL;

  const metric = isLowTouch || isAll ? undefined : visible.find((m) => m.id === selected) ?? visible[0];

  /** Métricas somadas no modo Visão Geral (todas as de contagem). */
  const allCountMetrics = useMemo(
    () => (isAll ? visible.filter((m) => m.unit === "count") : []),
    [isAll, visible],
  );

  const unit: "count" | "currency" = isLowTouch
    ? selected === LT_COUNT
      ? "count"
      : "currency"
    : isAll
      ? "count"
      : metric?.unit ?? "count";

  /** Métrica de MRR "total do dia" — usada quando não há recorte específico. */
  const mrrMetric = useMemo(
    () =>
      isLowTouch
        ? undefined
        : visible.find((m) => m.key === "mrr_dia") ?? visible.find((m) => m.unit === "currency"),
    [visible, isLowTouch],
  );

  /**
   * Coluna "Realizado R$" acompanha a métrica selecionada:
   * Vendas do dia -> MRR de vendas; Recuperados/Retidos -> MRR correspondente;
   * Visão Geral / MRR do dia -> MRR total do dia.
   */
  const finRealizedMetricId = useMemo(() => {
    if (isLowTouch) return undefined;
    if (isAll) return mrrMetric?.id;
    switch (metric?.key) {
      case "vendas_dia":
        return VIRTUAL_MRR_SALES;
      case "clientes_recuperados":
        return VIRTUAL_MRR_RECOVERY;
      case "clientes_retidos":
        return VIRTUAL_MRR_RETENTION;
      case "upsell_dia":
        return VIRTUAL_MRR_UPSELL;
      case "recuperados_ft":
        return VIRTUAL_MRR_RECOVERED_FT;
      case "oportunidades_abertas":
        return undefined;

      default:
        return mrrMetric?.id;
    }
  }, [isLowTouch, isAll, metric, mrrMetric]);


  /** Meta R$ só existe onde há meta cadastrada (métrica real de MRR). */
  const finGoalMetricId = useMemo(
    () => (finRealizedMetricId && finRealizedMetricId === mrrMetric?.id ? mrrMetric?.id : undefined),
    [finRealizedMetricId, mrrMetric],
  );

  /**
   * Fallback de Meta R$: usa a meta mensal da categoria correspondente
   * (New MRR / Recuperados / Retenção) rateada por dias úteis da semana —
   * a mesma base do painel "Metas por categoria — quebra semanal".
   */
  const categorySlugForFinGoal = useMemo(() => {
    if (isLowTouch || isAll || finGoalMetricId) return undefined;
    switch (metric?.key) {
      case "vendas_dia":
        return "new_mrr";
      case "clientes_recuperados":
        return "recuperados";
      case "clientes_retidos":
        return "retencao";
      case "upsell_dia":
        return "upsell";
      case "recuperados_ft":
        return "recuperados";
      default:
        return undefined;
    }
  }, [isLowTouch, isAll, finGoalMetricId, metric]);

  const { categories: goalCategories, targets: categoryTargets } = useCategoryWeeklyData(today);

  const categoryMonthTarget = useMemo(() => {
    if (!categorySlugForFinGoal) return 0;
    const cat = goalCategories.find((c) => c.slug === categorySlugForFinGoal);
    return cat ? categoryTargets.get(cat.id) ?? 0 : 0;
  }, [categorySlugForFinGoal, goalCategories, categoryTargets]);

  const showFin = isLowTouch ? unit !== "currency" : !!finRealizedMetricId && unit !== "currency";

  const weeks = useMemo(() => weeksOfMonth(today), [today]);
  const businessDaysInMonth = useMemo(
    () =>
      businessDaysBetween(
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 0),
      ),
    [today],
  );
  const todayKey = toBRDateKey(today);


  const baseRows: Row[] = useMemo(() => {
    const users = memberIds.length
      ? memberIds
      : Array.from(new Set(daily.map((d) => d.user_id)));
    const dailyTargetFor = (mid: string) =>
      users.reduce((s, uid) => s + resolveDailyTarget(goals, mid, uid, teamId), 0);
    const dailyTargetTotal = isLowTouch
      ? 0
      : isAll
        ? allCountMetrics.reduce((s, m) => s + dailyTargetFor(m.id), 0)
        : metric
          ? dailyTargetFor(metric.id)
          : 0;
    const finDailyTargetTotal =
      !isLowTouch && finGoalMetricId ? dailyTargetFor(finGoalMetricId) : 0;


    return weeks.map((w) => {
      const startKey = toBRDateKey(w.start);
      const endKey = toBRDateKey(w.end);
      const isCurrent = todayKey >= startKey && todayKey <= endKey;
      const isFuture = startKey > todayKey;

      let realized: number | null = null;
      let finRealized: number | null = null;
      if (!isFuture) {
        if (isLowTouch) {
          const sales = (lowTouchSales ?? []).filter(
            (s) => s.dateKey >= startKey && s.dateKey <= endKey,
          );
          realized =
            selected === LT_COUNT
              ? sales.length
              : sales.reduce((s, x) => s + (x.mrr ?? 0), 0);
          finRealized = sales.reduce((s, x) => s + (x.mrr ?? 0), 0);
        } else {
          realized = isAll
            ? allCountMetrics.reduce(
                (s, m) => s + realizedBetween(daily, m.id, users, w.start, w.end),
                0,
              )
            : metric
              ? realizedBetween(daily, metric.id, users, w.start, w.end)
              : 0;
          finRealized = finRealizedMetricId
            ? realizedBetween(daily, finRealizedMetricId, users, w.start, w.end)
            : null;
        }

      }

      const target =
        isLowTouch || !dailyTargetTotal ? null : dailyTargetTotal * w.businessDays;
      const finTarget = isLowTouch
        ? null
        : finDailyTargetTotal
          ? finDailyTargetTotal * w.businessDays
          : categoryMonthTarget && businessDaysInMonth
            ? (categoryMonthTarget * w.businessDays) / businessDaysInMonth
            : null;

      return {
        key: `${w.index}-${startKey}`,
        label: w.label,
        rangeLabel: w.rangeLabel,
        businessDays: w.businessDays,
        target,
        realized,
        finTarget,
        finRealized,
        isCurrent,
        isFuture,
      };
    });
  }, [weeks, memberIds, daily, goals, teamId, metric, finRealizedMetricId, finGoalMetricId, isLowTouch, lowTouchSales, selected, todayKey, isAll, allCountMetrics, categoryMonthTarget, businessDaysInMonth]);

  /** Metas semanais vivas: semanas futuras absorvem o saldo do mês. */
  const [revised, setRevised] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REVISED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setRevisedPersist = (v: boolean) => {
    setRevised(v);
    try {
      localStorage.setItem(REVISED_KEY, v ? "1" : "0");
    } catch {}
  };

  const rows: Row[] = useMemo(() => {
    if (!revised) return baseRows;
    const statusOf = (r: Row): WeekStatus =>
      r.isFuture ? "future" : r.isCurrent ? "current" : "closed";

    const monthTarget = baseRows.reduce((s, r) => s + (r.target ?? 0), 0);
    const res = computeRevisedWeeklyTargets({
      monthTarget,
      weeks: baseRows.map((r) => ({
        businessDays: r.businessDays,
        originalTarget: r.target,
        realized: r.realized,
        status: statusOf(r),
      })),
    });

    const finMonthTarget = baseRows.reduce((s, r) => s + (r.finTarget ?? 0), 0);
    const finRes = computeRevisedWeeklyTargets({
      monthTarget: finMonthTarget,
      weeks: baseRows.map((r) => ({
        businessDays: r.businessDays,
        originalTarget: r.finTarget,
        realized: r.finRealized,
        status: statusOf(r),
      })),
    });

    return baseRows.map((r, i) => ({
      ...r,
      target: r.target === null ? null : res.weeks[i].revisedTarget,
      targetDelta: r.target === null ? null : res.weeks[i].delta,
      finTarget: r.finTarget === null ? null : finRes.weeks[i].revisedTarget,
      finTargetDelta: r.finTarget === null ? null : finRes.weeks[i].delta,
    }));
  }, [baseRows, revised]);



  const totals = useMemo(() => {
    const businessDays = rows.reduce((s, r) => s + r.businessDays, 0);
    const hasTarget = rows.some((r) => r.target !== null);
    const target = hasTarget ? rows.reduce((s, r) => s + (r.target ?? 0), 0) : null;
    // Em contagens, cada semana é exibida arredondada; o total precisa somar
    // exatamente os valores mostrados (evita "16" quando as linhas somam 17).
    const realized = rows.reduce(
      (s, r) => s + (r.realized === null ? 0 : unit === "count" ? Math.round(r.realized) : r.realized),
      0,
    );
    const hasFinTarget = rows.some((r) => r.finTarget !== null);
    const finTarget = hasFinTarget ? rows.reduce((s, r) => s + (r.finTarget ?? 0), 0) : null;
    const hasFinRealized = rows.some((r) => r.finRealized !== null);
    const finRealized = hasFinRealized ? rows.reduce((s, r) => s + (r.finRealized ?? 0), 0) : null;
    return { businessDays, target, realized, finTarget, finRealized };
  }, [rows, unit]);

  const pctOf = (r: { target: number | null; realized: number | null }) =>
    r.target && r.target > 0 && r.realized !== null ? (r.realized / r.target) * 100 : null;

  const gapOf = (r: { target: number | null; realized: number | null }) =>
    r.target !== null && r.realized !== null ? r.realized - r.target : null;

  const gapText = (gap: number | null, u: "count" | "currency" = unit) => {
    if (gap === null) return "—";
    const abs = formatMetric(Math.abs(gap), u);
    return gap >= 0 ? `+${abs}` : `-${abs}`;
  };

  const fmtCur = (v: number | null) => (v === null ? "—" : formatMetric(v, "currency"));
  const finGap = (r: { finTarget: number | null; finRealized: number | null }) =>
    r.finTarget !== null && r.finRealized !== null ? r.finRealized - r.finTarget : null;

  const monthLabel = format(today, "MMMM 'de' yyyy", { locale: ptBR });

  /** Chip com a variação da meta revisada em relação à original. */
  const deltaText = (d: number | null | undefined, u: "count" | "currency" = unit) => {
    if (d === null || d === undefined || Math.abs(d) < 0.5) return null;
    return `${d > 0 ? "▲ +" : "▼ −"}${formatMetric(Math.abs(d), u)}`;
  };
  const DeltaChip = ({ d, u = unit }: { d: number | null | undefined; u?: "count" | "currency" }) => {
    const t = deltaText(d, u);
    if (!t) return null;
    return (
      <span
        className={cn("ml-1 text-[10px]", d! > 0 ? "text-destructive" : "text-emerald-600")}
        title="Meta reajustada pelo saldo das semanas fechadas"
      >
        {t}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3 px-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-1">
            <CollapseToggle open={open} onToggle={() => setOpen((v) => !v)} />
            <div>
            <CardTitle className="text-sm sm:text-base">Metas semanais do mês</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{monthLabel}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-md border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={revised ? "ghost" : "secondary"}
                className="h-8 px-2 text-xs"
                onClick={() => setRevisedPersist(false)}
              >
                Original
              </Button>
              <Button
                type="button"
                size="sm"
                variant={revised ? "secondary" : "ghost"}
                className="h-8 px-2 text-xs"
                onClick={() => setRevisedPersist(true)}
              >
                Revisada
              </Button>
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
                  <>
                    <SelectItem value={ALL}>Visão Geral (todas)</SelectItem>
                    {visible.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        {revised && (
          <p className="text-[11px] text-muted-foreground">
            Metas de semanas fechadas e da semana vigente são oficializadas; o saldo que falta para
            fechar a meta do mês é redistribuído entre as semanas futuras por dias úteis. Por isso a
            soma da coluna Meta pode ficar acima (ou abaixo) da meta original do mês — ela reflete o
            que ainda precisa ser feito, não o rateio inicial.
          </p>
        )}

      </CardHeader>
      {open && (
      <CardContent className="px-4 md:px-6">

        {/* Mobile: cards */}
        <div className="space-y-2 md:hidden">
          {rows.map((r) => {
            const pct = pctOf(r);
            const gap = gapOf(r);
            const fg = finGap(r);
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
                      <DeltaChip d={r.targetDelta} />
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
                {showFin && (
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">
                      R$: <span className="font-medium text-foreground">{fmtCur(r.finRealized)}</span>
                      {" "}/ {fmtCur(r.finTarget)}
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        fg === null ? "text-muted-foreground" : fg >= 0 ? "text-emerald-600" : "text-destructive",
                      )}
                    >
                      {fg === null
                        ? "—"
                        : fg >= 0
                          ? `excedente ${formatMetric(fg, "currency")}`
                          : `falta ${formatMetric(Math.abs(fg), "currency")}`}
                    </span>
                  </div>
                )}
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
                {showFin && (
                  <>
                    <th className="text-right font-medium py-2 pl-4">Meta R$</th>
                    <th className="text-right font-medium py-2">Realizado R$</th>
                    <th className="text-right font-medium py-2">Saldo R$</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = pctOf(r);
                const gap = gapOf(r);
                const fg = finGap(r);
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
                    <td className="py-2 text-right whitespace-nowrap">
                      {r.target === null ? "—" : formatMetric(r.target, unit)}
                      <DeltaChip d={r.targetDelta} />
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
                    {showFin && (
                      <>
                        <td className="py-2 text-right pl-4 whitespace-nowrap">
                          {fmtCur(r.finTarget)}
                          <DeltaChip d={r.finTargetDelta} u="currency" />
                        </td>
                        <td className="py-2 text-right">{fmtCur(r.finRealized)}</td>
                        <td
                          className={cn(
                            "py-2 text-right",
                            fg === null ? "text-muted-foreground" : fg >= 0 ? "text-emerald-600" : "text-destructive",
                          )}
                        >
                          {gapText(fg, "currency")}
                        </td>
                      </>
                    )}
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
                {showFin && (
                  <>
                    <td className="py-2 text-right pl-4">{fmtCur(totals.finTarget)}</td>
                    <td className="py-2 text-right">{fmtCur(totals.finRealized)}</td>
                    <td
                      className={cn(
                        "py-2 text-right",
                        totals.finTarget === null || totals.finRealized === null
                          ? "text-muted-foreground"
                          : totals.finRealized - totals.finTarget >= 0
                            ? "text-emerald-600"
                            : "text-destructive",
                      )}
                    >
                      {totals.finTarget === null || totals.finRealized === null
                        ? "—"
                        : gapText(totals.finRealized - totals.finTarget, "currency")}
                    </td>
                  </>
                )}
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
      )}
    </Card>

  );
}
