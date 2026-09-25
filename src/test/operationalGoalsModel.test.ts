import { describe, expect, it } from "vitest";
import type { GoalCategory } from "@/lib/goalCategories";
import { buildOperationalPeriodModel } from "@/components/goals/operationalGoalsModel";
import { weeksOfMonth } from "@/components/goals/tactical/types";

const category = (id: string, slug: string): GoalCategory => ({
  id,
  slug,
  name: slug,
  area: "sales",
  metric_type: "mrr",
  scope: "company",
  goal_direction: "gte",
  component_category_ids: null,
  is_active: true,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

describe("buildOperationalPeriodModel", () => {
  it("repete a soma canônica de Novas Vendas, Recuperados e Upsell no mês, semana e dia", () => {
    const monthStart = new Date(2026, 8, 1);
    const monthEnd = new Date(2026, 8, 30);
    const categories = [category("new", "new_mrr"), category("rec", "recuperados"), category("up", "upsell")];
    const series = new Map([
      ["new", [{ date: "2026-09-01", value: 100 }, { date: "2026-09-02", value: 250 }]],
      ["rec", [{ date: "2026-09-01", value: 40 }, { date: "2026-09-02", value: 60 }]],
      ["up", [{ date: "2026-09-01", value: 10 }, { date: "2026-09-02", value: 25 }]],
    ]);
    const result = buildOperationalPeriodModel({
      slug: "mrr_increase",
      categories,
      series,
      weeks: weeksOfMonth(monthStart),
      monthStart,
      monthEnd,
      asOf: new Date(2026, 8, 2),
      selectedDay: "2026-09-02",
      monthTarget: 2100,
      lowerIsBetter: false,
      revisedWeeklyTargets: false,
    });

    expect(result.monthRealized).toBe(335);
    expect(result.weeklyRealized[0]).toBe(335);
    expect(result.dayRealized).toBe(185);
  });

  it("repete a soma canônica de Churn MRR e Downsell", () => {
    const monthStart = new Date(2026, 8, 1);
    const monthEnd = new Date(2026, 8, 30);
    const categories = [category("churn", "churn-mrr"), category("down", "downsell")];
    const result = buildOperationalPeriodModel({
      slug: "mrr_decrease",
      categories,
      series: new Map([
        ["churn", [{ date: "2026-09-10", value: 900 }]],
        ["down", [{ date: "2026-09-10", value: 100 }]],
      ]),
      weeks: weeksOfMonth(monthStart),
      monthStart,
      monthEnd,
      asOf: new Date(2026, 8, 10),
      selectedDay: "2026-09-10",
      monthTarget: 1500,
      lowerIsBetter: true,
      revisedWeeklyTargets: false,
    });

    expect(result.monthRealized).toBe(1000);
    expect(result.dayRealized).toBe(1000);
  });
});