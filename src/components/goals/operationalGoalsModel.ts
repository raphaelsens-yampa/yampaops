import type { GoalCategory } from "@/lib/goalCategories";
import { computeRevisedWeeklyTargets, type WeekStatus } from "@/lib/revisedGoals";
import {
  businessDaysBetween,
  toBRDateKey,
  weekBusinessDaysDone,
  type MonthWeek,
} from "./tactical/types";
import type { CategorySnapPoint } from "./tactical/useCategoryWeeklyData";

const NORTH_STAR_COMPONENTS = {
  mrr_increase: ["new_mrr", "recuperados", "upsell"],
  mrr_decrease: ["churn-mrr", "downsell"],
} as const;

type NorthStarSlug = keyof typeof NORTH_STAR_COMPONENTS;

export function valueAsOf(points: CategorySnapPoint[] | undefined, key: string, minKey: string): number | null {
  if (!points?.length) return null;
  let found: number | null = null;
  for (const point of points) {
    if (point.date > key) break;
    if (point.date >= minKey) found = point.value;
  }
  return found;
}

function previousDayKey(date: Date): string {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return toBRDateKey(previous);
}

export interface OperationalPeriodModel {
  monthRealized: number | null;
  weeklyRealized: Array<number | null>;
  weeklyTargets: Array<number | null>;
  dayRealized: number | null;
  dayTarget: number;
}

interface OperationalModelInput {
  slug: NorthStarSlug;
  categories: GoalCategory[];
  series: Map<string, CategorySnapPoint[]>;
  weeks: MonthWeek[];
  monthStart: Date;
  monthEnd: Date;
  asOf: Date;
  selectedDay: string;
  monthTarget: number;
  lowerIsBetter: boolean;
  revisedWeeklyTargets: boolean;
}

/**
 * Mesma regra da quebra semanal de Metas Táticas:
 * - realizado = soma das folhas canônicas do north star;
 * - semana/dia = variação da série acumulada no período;
 * - metas = rateio por dias úteis, com a mesma revisão de saldo das semanas futuras.
 */
export function buildOperationalPeriodModel(input: OperationalModelInput): OperationalPeriodModel {
  const {
    slug,
    categories,
    series,
    weeks,
    monthStart,
    monthEnd,
    asOf,
    selectedDay,
    monthTarget,
    lowerIsBetter,
    revisedWeeklyTargets,
  } = input;
  const monthStartKey = toBRDateKey(monthStart);
  const asOfKey = toBRDateKey(asOf);
  const componentSlugs = NORTH_STAR_COMPONENTS[slug];
  const components = componentSlugs
    .map((componentSlug) => categories.find((category) => category.slug === componentSlug))
    .filter((category): category is GoalCategory => Boolean(category));

  const componentValueAt = (component: GoalCategory, key: string): number | null => (
    valueAsOf(series.get(component.id), key, monthStartKey)
  );
  const cumulativeAt = (key: string): number | null => {
    let sum = 0;
    let any = false;
    components.forEach((component) => {
      const value = componentValueAt(component, key);
      if (value === null) return;
      any = true;
      sum += value;
    });
    return any ? sum : null;
  };

  const realizedBetween = (start: Date, end: Date): number | null => {
    const startKey = toBRDateKey(start);
    const endKey = toBRDateKey(end) > asOfKey ? asOfKey : toBRDateKey(end);
    if (endKey < startKey) return null;
    let sum = 0;
    let any = false;
    components.forEach((component) => {
      const current = componentValueAt(component, endKey);
      if (current === null) return;
      any = true;
      const previous = componentValueAt(component, previousDayKey(start)) ?? 0;
      sum += Math.max(0, current - previous);
    });
    return any ? sum : null;
  };

  const businessDaysInMonth = businessDaysBetween(monthStart, monthEnd);
  const weeklyRealized = weeks.map((week) => realizedBetween(week.start, week.end));
  const originalTargets = weeks.map((week) => (
    monthTarget > 0 && businessDaysInMonth > 0
      ? (monthTarget * week.businessDays) / businessDaysInMonth
      : null
  ));
  let weeklyTargets = originalTargets;

  if (revisedWeeklyTargets && monthTarget > 0) {
    const revised = computeRevisedWeeklyTargets({
      monthTarget,
      lowerIsBetter,
      allowDecrease: lowerIsBetter,
      weeks: weeks.map((week, index) => {
        const startKey = toBRDateKey(week.start);
        const endKey = toBRDateKey(week.end);
        const isCurrent = asOfKey >= startKey && asOfKey <= endKey;
        const status: WeekStatus = startKey > asOfKey
          ? "future"
          : isCurrent && !weekBusinessDaysDone(week.start, week.end, asOf)
            ? "current"
            : "closed";
        return {
          businessDays: week.businessDays,
          originalTarget: originalTargets[index],
          realized: weeklyRealized[index],
          status,
        };
      }),
    });
    weeklyTargets = revised.weeks.map((week) => week.revisedTarget);
  }

  const selectedDate = new Date(`${selectedDay}T00:00:00`);
  const containingWeekIndex = weeks.findIndex(
    (week) => selectedDate >= week.start && selectedDate <= week.end,
  );
  const selectedWeek = containingWeekIndex >= 0 ? weeks[containingWeekIndex] : null;
  const selectedWeekTarget = containingWeekIndex >= 0 ? weeklyTargets[containingWeekIndex] : null;
  const dayTarget = selectedWeek && selectedWeekTarget !== null && selectedWeek.businessDays > 0
    ? selectedWeekTarget / selectedWeek.businessDays
    : businessDaysInMonth > 0
      ? monthTarget / businessDaysInMonth
      : 0;

  return {
    monthRealized: cumulativeAt(asOfKey),
    weeklyRealized,
    weeklyTargets,
    dayRealized: selectedDay <= asOfKey ? realizedBetween(selectedDate, selectedDate) : null,
    dayTarget,
  };
}