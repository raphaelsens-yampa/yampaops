import { describe, expect, it } from "vitest";
import { buildScenarioFactors, makeGrowthRate, type GrowthBaseline } from "@/lib/goalScenario";

const BASELINES: GrowthBaseline[] = [{ effective_month: "2026-09-01", growth_pct: 1.2 }];

const categories = [
  { id: "total", slug: "total_de_mrr_ms3g6o38", goal_direction: "gte" },
  { id: "new", slug: "new_mrr", goal_direction: "gte" },
  { id: "churn", slug: "churn-mrr", goal_direction: "lte" },
];

const goals = [
  { category_id: "total", period_start: "2026-08-01", period_end: "2026-08-31", target_mrr: 1000 },
  { category_id: "total", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 1010 },
  { category_id: "new", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 100 },
  { category_id: "churn", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 50 },
];

describe("makeGrowthRate", () => {
  it("usa a base padrão de 1% antes da primeira revisão", () => {
    expect(makeGrowthRate(0, BASELINES)("2026-08")).toBeCloseTo(0.01);
  });

  it("aplica a revisão do mês de início em diante", () => {
    const rate = makeGrowthRate(0, BASELINES);
    expect(rate("2026-09")).toBeCloseTo(0.012);
    expect(rate("2026-12")).toBeCloseTo(0.012);
  });

  it("cenário simulado sobrepõe a base cadastrada", () => {
    expect(makeGrowthRate(5, BASELINES)("2026-09")).toBeCloseTo(0.05);
  });
});

describe("buildScenarioFactors com base revisada", () => {
  it("não altera meses até a âncora e eleva o mês seguinte", () => {
    const factors = buildScenarioFactors(goals, categories, 0, { month: "2026-08", value: 1000 }, BASELINES);
    expect(factors.get("total|2026-08")).toBe(1);
    // estoque de setembro = 1000 * 1,012 = 1012 sobre a meta cadastrada de 1010
    expect(factors.get("total|2026-09")).toBeCloseTo(1012 / 1010, 6);
    // churn fica 1,2% mais rígido
    expect(factors.get("churn|2026-09")).toBeCloseTo(0.988, 6);
  });

  it("sem revisões e sem cenário, nada muda", () => {
    const factors = buildScenarioFactors(goals, categories, 0, { month: "2026-08", value: 1000 }, []);
    expect(factors.size).toBe(0);
  });
});
