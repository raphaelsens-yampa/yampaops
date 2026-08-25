import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapseToggle } from "./CollapseToggle";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS, isBetterBelow, type GoalCategory } from "@/lib/goalCategories";
import {
  businessDaysBetween,
  formatMetric,
  realizedBetween,
  toBRDateKey,
  weekBusinessDaysDone,
  weeksOfMonth,
  type DailyDatum,
} from "./types";
import {
  CATEGORY_TACTICAL_METRIC,
  STOCK_CATEGORY_SLUGS,
  useCategoryWeeklyData,
  type CategorySnapPoint,
} from "./useCategoryWeeklyData";
import { isOriginFiltered, originLabel, ORIGIN_NO_SPLIT_HINT, type OriginFilter } from "@/lib/origins";
import {
  COUPON_NO_SPLIT_HINT,
  COUPON_OPTIONS,
  CATEGORY_SLUG_TO_COUPON_CLASS,
  applyCouponMode,
  couponLabel,
  couponShareBetween,
  isCouponFiltered,
  type CouponFilter,
} from "./campaignCoupons";
import { computeRevisedWeeklyTargets, type WeekStatus } from "@/lib/revisedGoals";

const STORAGE_KEY = "tactical_category_weekly_v1";
const REVISED_KEY = "tactical_category_weekly_revised_v1";
const COUPON_KEY = "tactical_category_weekly_coupon_v1";
const DEFAULT_SLUGS = ["total_de_mrr_ms3g6o38"];

interface Props {
  today: Date;
  daily?: DailyDatum[];
  refreshKey?: number;
  origin?: OriginFilter;
  /** Soma a conta yampa 2.0 em MRR/Ativos e sua variação no Net MRR. */
  includeYampa20?: boolean;
}

interface WeekRow {
  key: string;
  label: string;
  rangeLabel: string;
  businessDays: number;
  target: number | null;
  realized: number | null;
  isCurrent: boolean;
  isFuture: boolean;
  /** Semana vigente com todos os dias úteis já concluídos (sáb/dom). */
  bdDone?: boolean;
  /** Variação entre meta revisada e original (só semanas futuras). */
  targetDelta?: number | null;
}


function fmt(value: number, cat: GoalCategory): string {
  if (cat.metric_type === "ratio") return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (cat.metric_type === "count") return formatMetric(value, "count");
  return formatMetric(value, "currency");
}

/** Último ponto com data <= key (opcionalmente limitado a >= minKey). */
function valueAsOf(points: CategorySnapPoint[] | undefined, key: string, minKey?: string): number | null {
  if (!points?.length) return null;
  let found: number | null = null;
  for (const p of points) {
    if (p.date > key) break;
    if (minKey && p.date < minKey) continue;
    found = p.value;
  }
  return found;
}

export function CategoryWeeklyGoalsPanel({ today, daily = [], refreshKey = 0, origin = "all", includeYampa20 = false }: Props) {
  const [open, setOpen] = useState(false);

  const [coupon, setCoupon] = useState<CouponFilter>(() => {
    try {
      const raw = localStorage.getItem(COUPON_KEY) as CouponFilter | null;
      return raw === "campaign" || raw === "non_campaign" ? raw : "all";
    } catch {
      return "all";
    }
  });
  const setCouponPersist = (v: CouponFilter) => {
    setCoupon(v);
    try {
      localStorage.setItem(COUPON_KEY, v);
    } catch {}
  };

  const { categories, targets, series, noOriginSplit, couponShares, loading } = useCategoryWeeklyData(
    today,
    refreshKey,
    origin,
    includeYampa20,
    coupon,
  );
  const originFiltered = isOriginFiltered(origin);
  const couponFiltered = isCouponFiltered(coupon);
  const yampa20Applied = includeYampa20 && !originFiltered;

  const available = useMemo(
    () => categories.filter((c) => (targets.get(c.id) ?? 0) > 0),
    [categories, targets],
  );

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);



  const [selectedIds, setSelectedIds] = useState<string[] | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  });

  const effectiveIds = useMemo(() => {
    if (selectedIds?.length) return selectedIds.filter((id) => available.some((c) => c.id === id));
    const defaults = available.filter((c) => DEFAULT_SLUGS.includes(c.slug)).map((c) => c.id);
    return defaults.length ? defaults : available.slice(0, 1).map((c) => c.id);
  }, [selectedIds, available]);

  const toggle = (id: string) => {
    const next = effectiveIds.includes(id)
      ? effectiveIds.filter((x) => x !== id)
      : [...effectiveIds, id];
    setSelectedIds(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

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

  const weeks = useMemo(() => weeksOfMonth(today), [today]);
  const todayKey = toBRDateKey(today);
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const monthEnd = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 1, 0), [today]);
  const monthStartKey = toBRDateKey(monthStart);
  const businessDaysInMonth = useMemo(
    () => businessDaysBetween(monthStart, monthEnd),
    [monthStart, monthEnd],
  );
  const monthLabel = format(today, "MMMM 'de' yyyy", { locale: ptBR });

  const blocks = useMemo(() => {
    return effectiveIds
      .map((id) => available.find((c) => c.id === id))
      .filter((c): c is GoalCategory => !!c)
      .map((cat) => {
        const monthTarget = targets.get(cat.id) ?? 0;
        const isStock = STOCK_CATEGORY_SLUGS.has(cat.slug);
        const tacticalMetricId = CATEGORY_TACTICAL_METRIC[cat.slug];
        const points = series.get(cat.id);
        const componentIds = (cat.component_category_ids ?? []).filter(Boolean);
        const isAggregate = componentIds.length > 0;

        /**
         * Recorte por cupom nos realizados que vêm das métricas táticas
         * (`daily`) — o rateio do snapshot já é aplicado no hook.
         */
        const withCoupon = (
          value: number | null,
          leaf: GoalCategory,
          startKey: string,
          cutKey: string,
        ): number | null => {
          if (value === null || !couponShares) return value;
          const cls = CATEGORY_SLUG_TO_COUPON_CLASS[leaf.slug];
          if (!cls) return null;
          // Participação da JANELA da semana (não do mês acumulado).
          const share = couponShareBetween(
            couponShares,
            startKey,
            cutKey,
            cls,
            leaf.metric_type === "count" ? "qtd" : "mrr",
          );
          if (share === null) return null;
          return applyCouponMode(value, share, coupon);
        };

        /** Realizado de uma categoria "folha" (com snapshot ou métrica tática) na semana. */
        const leafRealized = (
          leaf: GoalCategory,
          w: (typeof weeks)[number],
          isCurrent: boolean,
          cutKey: string,
        ): number | null => {
          const leafMetricId = CATEGORY_TACTICAL_METRIC[leaf.slug];
          if (leafMetricId) {
            const end = new Date(w.end);
            if (isCurrent) end.setTime(today.getTime());
            return withCoupon(
              realizedBetween(daily, leafMetricId, [], w.start, end),
              leaf,
              toBRDateKey(w.start),
              cutKey,
            );
          }
          const leafPoints = series.get(leaf.id);
          if (STOCK_CATEGORY_SLUGS.has(leaf.slug)) {
            return valueAsOf(leafPoints, cutKey, monthStartKey);
          }
          const cur = valueAsOf(leafPoints, cutKey, monthStartKey);
          if (cur === null) return null;
          const prevKey = toBRDateKey(
            new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() - 1),
          );
          const base = valueAsOf(leafPoints, prevKey, monthStartKey) ?? 0;
          // MTD só cresce: queda na série = revisão da base, não realizado negativo.
          return Math.max(0, cur - base);
        };

        const rows: WeekRow[] = weeks.map((w) => {
          const startKey = toBRDateKey(w.start);
          const endKey = toBRDateKey(w.end);
          const isCurrent = todayKey >= startKey && todayKey <= endKey;
          const isFuture = startKey > todayKey;
          const cutKey = isCurrent && todayKey < endKey ? todayKey : endKey;

          let realized: number | null = null;
          if (!isFuture) {
            if (isAggregate) {
              // Agregadoras (MRR Increase / MRR Decrease) somam as componentes.
              let sum = 0;
              let any = false;
              for (const id of componentIds) {
                const leaf = catById.get(id);
                if (!leaf) continue;
                const v = leafRealized(leaf, w, isCurrent, cutKey);
                if (v === null) continue;
                any = true;
                sum += Math.abs(v);
              }
              realized = any ? sum : null;
            } else if (tacticalMetricId) {
              const end = new Date(w.end);
              if (isCurrent) end.setTime(today.getTime());
              realized = withCoupon(
                realizedBetween(daily, tacticalMetricId, [], w.start, end),
                cat,
                startKey,
                cutKey,
              );
            } else if (isStock) {
              realized = valueAsOf(points, cutKey, monthStartKey);
            } else {
              const cur = valueAsOf(points, cutKey, monthStartKey);
              if (cur !== null) {
                const prevKey = toBRDateKey(
                  new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() - 1),
                );
                const base = valueAsOf(points, prevKey, monthStartKey) ?? 0;
                realized = Math.max(0, cur - base);
              }
            }
          }

          const target = monthTarget && businessDaysInMonth
            ? isStock
              ? monthTarget
              : (monthTarget * w.businessDays) / businessDaysInMonth
            : null;

          return {
            key: `${cat.id}-${w.index}`,
            label: w.label,
            rangeLabel: w.rangeLabel,
            businessDays: w.businessDays,
            target,
            realized,
            isCurrent,
            isFuture,
            bdDone: isCurrent && weekBusinessDaysDone(w.start, w.end, today),
          };
        });

        const realizedTotal = isStock
          ? valueAsOf(points, todayKey, monthStartKey)
          : rows.some((r) => r.realized !== null)
            ? rows.reduce((s, r) => s + (r.realized ?? 0), 0)
            : tacticalMetricId
              ? 0
              : null;

        // Metas vivas: semanas futuras absorvem o saldo do mês (estoque não rateia).
        let displayRows = rows;
        let unrecovered = 0;
        if (revised && !isStock && monthTarget > 0) {
          const res = computeRevisedWeeklyTargets({
            monthTarget,
            lowerIsBetter: isBetterBelow(cat.goal_direction),
            allowDecrease: isBetterBelow(cat.goal_direction),

            weeks: rows.map((r) => ({
              businessDays: r.businessDays,
              originalTarget: r.target,
              realized: r.realized,
              status: (r.isFuture
                ? "future"
                : r.isCurrent && !r.bdDone
                  ? "current"
                  : "closed") as WeekStatus,
            })),
          });
          unrecovered = res.unrecovered;
          displayRows = rows.map((r, i) => ({
            ...r,
            target: r.target === null ? null : res.weeks[i].revisedTarget,
            targetDelta: r.target === null ? null : res.weeks[i].delta,
          }));
        }

        const partialOrigin =
          (originFiltered || couponFiltered) &&
          (isAggregate
            ? componentIds.some((id) => noOriginSplit.has(id))
            : noOriginSplit.has(cat.id));

        return {
          cat,
          monthTarget,
          isStock,
          rows: displayRows,
          unrecovered,
          realizedTotal,
          partialOrigin,
          source: isAggregate ? "soma das componentes" : tacticalMetricId ? "tático" : "snapshot",
        };
      });
  }, [effectiveIds, available, catById, targets, series, weeks, todayKey, daily, businessDaysInMonth, monthStartKey, today, originFiltered, couponFiltered, couponShares, noOriginSplit, revised]);



  // Atingimento sempre realizado ÷ meta. Para categorias "teto" (menor é melhor),
  // ficar abaixo de 100% é bom — a cor é definida por isGood, não pelo percentual.
  const pctOf = (target: number | null, realized: number | null, cat: GoalCategory) => {
    if (!target || target <= 0 || realized === null) return null;
    return (realized / target) * 100;
  };

  const isGood = (target: number | null, realized: number | null, cat: GoalCategory) => {
    if (target === null || realized === null) return null;
    return isBetterBelow(cat.goal_direction) ? realized <= target : realized >= target;
  };

  const gapLabel = (target: number | null, realized: number | null, cat: GoalCategory) => {
    if (target === null || realized === null) return "—";
    const diff = isBetterBelow(cat.goal_direction) ? target - realized : realized - target;
    const abs = fmt(Math.abs(diff), cat);
    return diff >= 0 ? `excedente ${abs}` : `falta ${abs}`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Carregando metas por categoria...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3 px-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-1">
            <CollapseToggle open={open} onToggle={() => setOpen((v) => !v)} />
            <div>
            <CardTitle className="text-sm sm:text-base">Metas por categoria — quebra semanal</CardTitle>
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
            <div className="inline-flex rounded-md border p-0.5">
              {COUPON_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  size="sm"
                  variant={coupon === o.value ? "secondary" : "ghost"}
                  className="h-8 px-2 text-xs"
                  onClick={() => setCouponPersist(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 md:h-9 md:w-56 justify-between">
                <span className="truncate">
                  {effectiveIds.length === 1
                    ? available.find((c) => c.id === effectiveIds[0])?.name
                    : `${effectiveIds.length} categorias`}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2 max-h-80 overflow-y-auto">
              {available.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">
                  Nenhuma categoria com meta cadastrada neste mês.
                </p>
              )}
              {available.map((c) => (
                <label
                  key={c.id}
                  className="flex items-start gap-2 rounded-md p-2 hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={effectiveIds.includes(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-tight">
                    {c.name}
                    <span className="block text-[11px] text-muted-foreground">
                      {AREA_LABELS[c.area] ?? c.area}
                    </span>
                  </span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          A meta mensal é rateada por dias úteis de cada semana. Categorias de estoque (MRR total,
          ativos, churn %) comparam o nível do fim da semana com a meta do mês.
          {couponFiltered && ` Recorte "${couponLabel(coupon)}": o realizado é rateado pela participação dos cupons de campanha nas conversões da Stripe (churn cruzado por e-mail); as metas seguem as cadastradas.`}
          {revised && " Na visão Revisada, o saldo entre a meta do mês e o realizado das semanas fechadas é redistribuído nas semanas futuras por dias úteis — a soma das metas semanais pode então diferir da meta original do mês."}
        </p>
      </CardHeader>
      {open && (
      <CardContent className="px-4 md:px-6 space-y-5">

        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground">Selecione ao menos uma categoria.</p>
        )}
        {blocks.map(({ cat, monthTarget, isStock, rows, realizedTotal, source, partialOrigin }) => {
          const monthPct = pctOf(monthTarget, realizedTotal, cat);
          const good = isGood(monthTarget, realizedTotal, cat);
          return (
            <div key={cat.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{cat.name}</span>
                  <Badge variant="outline" className="text-[10px]">{AREA_LABELS[cat.area] ?? cat.area}</Badge>
                  {isBetterBelow(cat.goal_direction) && (
                    <Badge variant="secondary" className="text-[10px]">teto</Badge>
                  )}
                  {isStock && <Badge variant="secondary" className="text-[10px]">estoque</Badge>}
                  <span className="text-[10px] text-muted-foreground">fonte: {source}</span>
                  {originFiltered && (
                    <Badge variant="secondary" className="text-[10px]">{originLabel(origin)}</Badge>
                  )}
                  {couponFiltered && (
                    <Badge variant="secondary" className="text-[10px]">{couponLabel(coupon)}</Badge>
                  )}
                  {yampa20Applied && ["total_de_mrr_ms3g6o38", "usuarios_ativos_pagantes_ms8yyce5", "net-mrr"].includes(cat.slug) && (
                    <Badge variant="secondary" className="text-[10px]">+ 2.0</Badge>
                  )}
                  {partialOrigin && (
                    <span className="text-[10px] text-amber-600">
                      {couponFiltered ? COUPON_NO_SPLIT_HINT : ORIGIN_NO_SPLIT_HINT}
                    </span>
                  )}
                </div>
                <span className="text-xs">
                  Mês:{" "}
                  <span className={cn("font-semibold", good === null ? "" : good ? "text-emerald-600" : "text-destructive")}>
                    {realizedTotal === null ? "—" : fmt(realizedTotal, cat)}
                  </span>
                  <span className="text-muted-foreground"> / {fmt(monthTarget, cat)}</span>
                  {monthPct !== null && (
                    <span className="text-muted-foreground"> ({Math.round(monthPct)}%)</span>
                  )}
                </span>
              </div>

              {/* Mobile: cards */}
              <div className="space-y-2 md:hidden">
                {rows.map((r) => {
                  const pct = pctOf(r.target, r.realized, cat);
                  const ok = isGood(r.target, r.realized, cat);
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
                            {r.realized === null ? "—" : fmt(r.realized, cat)}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}/ {r.target === null ? "—" : fmt(r.target, cat)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            ok === null ? "text-muted-foreground" : ok ? "text-emerald-600" : "text-destructive",
                          )}
                        >
                          {gapLabel(r.target, r.realized, cat)}
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
                      const pct = pctOf(r.target, r.realized, cat);
                      const ok = isGood(r.target, r.realized, cat);
                      return (
                        <tr
                          key={r.key}
                          className={cn("border-b last:border-0", r.isCurrent && "bg-primary/5")}
                        >
                          <td className="py-2 font-medium">
                            {r.label}
                            {r.isCurrent && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">atual</Badge>
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground">{r.rangeLabel}</td>
                          <td className="py-2 text-right text-muted-foreground">{r.businessDays}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {r.target === null ? "—" : fmt(r.target, cat)}
                            {r.targetDelta !== null && r.targetDelta !== undefined && Math.abs(r.targetDelta) >= 0.5 && (
                              <span
                                className={cn(
                                  "ml-1 text-[10px]",
                                  r.targetDelta > 0 ? "text-destructive" : "text-emerald-600",
                                )}
                                title="Meta reajustada pelo saldo das semanas fechadas"
                              >
                                {r.targetDelta > 0 ? "▲ +" : "▼ −"}
                                {fmt(Math.abs(r.targetDelta), cat)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {r.realized === null ? "—" : fmt(r.realized, cat)}
                          </td>
                          <td
                            className={cn(
                              "py-2 text-right",
                              ok === null ? "text-muted-foreground" : ok ? "text-emerald-600" : "text-destructive",
                            )}
                          >
                            {pct === null ? "—" : `${Math.round(pct)}%`}
                          </td>
                          <td
                            className={cn(
                              "py-2 text-right text-xs",
                              ok === null ? "text-muted-foreground" : ok ? "text-emerald-600" : "text-destructive",
                            )}
                          >
                            {gapLabel(r.target, r.realized, cat)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-medium">
                      <td className="py-2">Mês</td>
                      <td className="py-2 text-muted-foreground capitalize">{monthLabel}</td>
                      <td className="py-2 text-right text-muted-foreground">{businessDaysInMonth}</td>
                      <td className="py-2 text-right">{fmt(monthTarget, cat)}</td>
                      <td className="py-2 text-right">
                        {realizedTotal === null ? "—" : fmt(realizedTotal, cat)}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right",
                          good === null ? "text-muted-foreground" : good ? "text-emerald-600" : "text-destructive",
                        )}
                      >
                        {monthPct === null ? "—" : `${Math.round(monthPct)}%`}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right text-xs",
                          good === null ? "text-muted-foreground" : good ? "text-emerald-600" : "text-destructive",
                        )}
                      >
                        {gapLabel(monthTarget, realizedTotal, cat)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </CardContent>
      )}
    </Card>

  );
}
