import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronLeft, ChevronRight, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS, isBetterBelow, type GoalCategory } from "@/lib/goalCategories";
import {
  businessDaysBetween,
  formatMetric,
  toBRDateKey,
  weeksOfMonth,
} from "@/components/goals/tactical/types";
import {
  STOCK_CATEGORY_SLUGS,
  useCategoryWeeklyData,
  type CategorySnapPoint,
} from "@/components/goals/tactical/useCategoryWeeklyData";

const STORAGE_KEY = "goals_category_weekly_matrix_v1";

function fmt(value: number, cat: GoalCategory): string {
  if (cat.metric_type === "ratio")
    return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
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

interface Cell {
  target: number | null;
  realized: number | null;
  hit: boolean | null;
  isCurrent: boolean;
  isFuture: boolean;
}

export function CategoryWeeklyMatrix() {
  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [refMonth, setRefMonth] = useState<Date>(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );

  const { categories, targets, series, loading } = useCategoryWeeklyData(refMonth);

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
    return available.map((c) => c.id);
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

  const weeks = useMemo(() => weeksOfMonth(refMonth), [refMonth]);
  const todayKey = toBRDateKey(now);
  const monthStart = useMemo(
    () => new Date(refMonth.getFullYear(), refMonth.getMonth(), 1),
    [refMonth],
  );
  const monthEnd = useMemo(
    () => new Date(refMonth.getFullYear(), refMonth.getMonth() + 1, 0),
    [refMonth],
  );
  const monthStartKey = toBRDateKey(monthStart);
  const businessDaysInMonth = useMemo(
    () => businessDaysBetween(monthStart, monthEnd),
    [monthStart, monthEnd],
  );
  const monthLabel = format(refMonth, "MMMM 'de' yyyy", { locale: ptBR });
  const isCurrentMonth =
    refMonth.getFullYear() === now.getFullYear() && refMonth.getMonth() === now.getMonth();

  const rows = useMemo(() => {
    return effectiveIds
      .map((id) => available.find((c) => c.id === id))
      .filter((c): c is GoalCategory => !!c)
      .map((cat) => {
        const monthTarget = targets.get(cat.id) ?? 0;
        const isStock = STOCK_CATEGORY_SLUGS.has(cat.slug);
        const points = series.get(cat.id);
        const componentIds = (cat.component_category_ids ?? []).filter(Boolean);
        const isAggregate = componentIds.length > 0;
        const below = isBetterBelow(cat.goal_direction);

        const snapRealized = (
          leafPoints: CategorySnapPoint[] | undefined,
          leafSlug: string,
          w: (typeof weeks)[number],
          cutKey: string,
        ): number | null => {
          if (STOCK_CATEGORY_SLUGS.has(leafSlug)) return valueAsOf(leafPoints, cutKey, monthStartKey);
          const cur = valueAsOf(leafPoints, cutKey, monthStartKey);
          if (cur === null) return null;
          const prevKey = toBRDateKey(
            new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() - 1),
          );
          const base = valueAsOf(leafPoints, prevKey, monthStartKey) ?? 0;
          return cur - base;
        };

        const cells: Cell[] = weeks.map((w) => {
          const startKey = toBRDateKey(w.start);
          const endKey = toBRDateKey(w.end);
          const isCurrent = todayKey >= startKey && todayKey <= endKey;
          const isFuture = startKey > todayKey;
          const cutKey = isCurrent && todayKey < endKey ? todayKey : endKey;

          let realized: number | null = null;
          if (!isFuture) {
            if (isAggregate) {
              let sum = 0;
              let any = false;
              for (const id of componentIds) {
                const leaf = catById.get(id);
                if (!leaf) continue;
                const v = snapRealized(series.get(leaf.id), leaf.slug, w, cutKey);
                if (v === null) continue;
                any = true;
                sum += Math.abs(v);
              }
              realized = any ? sum : null;
            } else {
              realized = snapRealized(points, cat.slug, w, cutKey);
            }
          }

          const target =
            monthTarget && businessDaysInMonth
              ? isStock
                ? monthTarget
                : (monthTarget * w.businessDays) / businessDaysInMonth
              : null;

          const hit =
            target === null || realized === null
              ? null
              : below
                ? realized <= target
                : realized >= target;

          return { target, realized, hit, isCurrent, isFuture };
        });

        const realizedTotal = isStock
          ? valueAsOf(points, isCurrentMonth ? todayKey : toBRDateKey(monthEnd), monthStartKey)
          : cells.some((c) => c.realized !== null)
            ? cells.reduce((s, c) => s + (c.realized ?? 0), 0)
            : null;

        const monthHit =
          !monthTarget || realizedTotal === null
            ? null
            : below
              ? realizedTotal <= monthTarget
              : realizedTotal >= monthTarget;

        return { cat, monthTarget, isStock, below, cells, realizedTotal, monthHit };
      });
  }, [
    effectiveIds,
    available,
    catById,
    targets,
    series,
    weeks,
    todayKey,
    businessDaysInMonth,
    monthStartKey,
    monthEnd,
    isCurrentMonth,
  ]);

  const shiftMonth = (dir: 1 | -1) =>
    setRefMonth((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));

  const HitBadge = () => (
    <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">
      <CheckCircle2 className="h-3 w-3" /> Meta batida
    </Badge>
  );

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3 px-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base">
              Metas por categoria x semanas do mês
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{monthLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 border rounded-md px-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => shiftMonth(-1)}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm capitalize px-2 min-w-[130px] text-center">{monthLabel}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => shiftMonth(1)}
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {!isCurrentMonth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRefMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
              >
                Mês atual
              </Button>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 md:w-56 justify-between">
                  <span className="truncate">
                    {effectiveIds.length === available.length
                      ? "Todas as categorias"
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
          Esperado = meta mensal rateada pelos dias úteis da semana. A badge "Meta batida" aparece
          quando o realizado atinge o esperado (para categorias de teto, quando fica abaixo dele).
          Categorias de estoque (MRR total, ativos, churn %) comparam o nível do fim da semana com a
          meta do mês.
        </p>
      </CardHeader>
      <CardContent className="px-4 md:px-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando metas por categoria...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria com meta cadastrada neste mês.
          </p>
        ) : (
          <>
            {/* Desktop: matriz */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 pr-3 sticky left-0 bg-card">
                      Categoria
                    </th>
                    {weeks.map((w) => (
                      <th key={w.index} className="text-right font-medium py-2 px-3 min-w-[140px]">
                        {w.label} · {w.rangeLabel}
                        <span className="block font-normal">{w.businessDays} d.ú.</span>
                      </th>
                    ))}
                    <th className="text-right font-medium py-2 pl-3 min-w-[140px]">Mês</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ cat, monthTarget, isStock, below, cells, realizedTotal, monthHit }) => (
                    <tr key={cat.id} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-3 sticky left-0 bg-card">
                        <span className="font-medium">{cat.name}</span>
                        <span className="flex flex-wrap items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {AREA_LABELS[cat.area] ?? cat.area}
                          </Badge>
                          {below && (
                            <Badge variant="secondary" className="text-[10px]">
                              teto
                            </Badge>
                          )}
                          {isStock && (
                            <Badge variant="secondary" className="text-[10px]">
                              estoque
                            </Badge>
                          )}
                        </span>
                      </td>
                      {cells.map((c, i) => (
                        <td
                          key={i}
                          className={cn("py-3 px-3 text-right", c.isCurrent && "bg-primary/5")}
                        >
                          {c.isFuture ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-[11px] text-muted-foreground">
                                Esperado: {c.target === null ? "—" : fmt(c.target, cat)}
                              </div>
                              <div className="font-medium">
                                {c.realized === null ? "—" : fmt(c.realized, cat)}
                              </div>
                              {c.hit && (
                                <div className="flex justify-end">
                                  <HitBadge />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="py-3 pl-3 text-right">
                        <div className="space-y-1">
                          <div className="text-[11px] text-muted-foreground">
                            Esperado: {fmt(monthTarget, cat)}
                          </div>
                          <div className="font-semibold">
                            {realizedTotal === null ? "—" : fmt(realizedTotal, cat)}
                          </div>
                          {monthHit && (
                            <div className="flex justify-end">
                              <HitBadge />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards por categoria */}
            <div className="space-y-4 md:hidden">
              {rows.map(({ cat, monthTarget, isStock, below, cells, realizedTotal, monthHit }) => (
                <div key={cat.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{cat.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {AREA_LABELS[cat.area] ?? cat.area}
                    </Badge>
                    {below && (
                      <Badge variant="secondary" className="text-[10px]">
                        teto
                      </Badge>
                    )}
                    {isStock && (
                      <Badge variant="secondary" className="text-[10px]">
                        estoque
                      </Badge>
                    )}
                  </div>
                  {weeks.map((w, i) => {
                    const c = cells[i];
                    return (
                      <div
                        key={w.index}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md border p-2",
                          c.isCurrent && "border-primary/50 bg-primary/5",
                        )}
                      >
                        <div className="text-xs">
                          <span className="font-medium">{w.label}</span>{" "}
                          <span className="text-muted-foreground">{w.rangeLabel}</span>
                        </div>
                        <div className="text-right text-xs">
                          {c.isFuture ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              <div className="font-semibold text-sm">
                                {c.realized === null ? "—" : fmt(c.realized, cat)}
                              </div>
                              <div className="text-muted-foreground">
                                esperado {c.target === null ? "—" : fmt(c.target, cat)}
                              </div>
                              {c.hit && (
                                <div className="flex justify-end mt-1">
                                  <HitBadge />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                    <span className="font-medium">Mês</span>
                    <div className="text-right">
                      <div className="font-semibold text-sm">
                        {realizedTotal === null ? "—" : fmt(realizedTotal, cat)}
                      </div>
                      <div className="text-muted-foreground">esperado {fmt(monthTarget, cat)}</div>
                      {monthHit && (
                        <div className="flex justify-end mt-1">
                          <HitBadge />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
