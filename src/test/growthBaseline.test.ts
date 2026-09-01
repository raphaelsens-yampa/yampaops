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

  it("usa o realizado do mês anterior mesmo sem meta cadastrada nesse mês", () => {
    const onlySep = goals.filter((g) => g.period_start.startsWith("2026-09"));
    const factors = buildScenarioFactors(onlySep, categories, 0, { month: "2026-08", value: 1000 }, BASELINES);
    expect(factors.get("total|2026-09")).toBeCloseTo(1012 / 1010, 6);
  });

  it("meses futuros compõem sobre o projetado, não sobre o realizado", () => {
    const withOct = [
      ...goals,
      { category_id: "total", period_start: "2026-10-01", period_end: "2026-10-31", target_mrr: 1020 },
    ];
    const factors = buildScenarioFactors(withOct, categories, 0, { month: "2026-08", value: 1000 }, BASELINES);
    // out = 1000 * 1,012 * 1,012
    expect(factors.get("total|2026-10")).toBeCloseTo((1000 * 1.012 * 1.012) / 1020, 6);
  });

  it("permite fator abaixo de 1 quando o realizado ficou abaixo da meta cadastrada", () => {
    const factors = buildScenarioFactors(goals, categories, 0, { month: "2026-08", value: 900 }, BASELINES);
    const f = factors.get("total|2026-09");
    expect(f).toBeDefined();
    if (f === undefined) return;
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo((900 * 1.012) / 1010, 6);
  });
});


  it("faz MRR Increase ser a soma ajustada de New, Recuperados e Upsell", () => {
    const cats = [
      ...categories,
      { id: "recovered", slug: "recuperados", goal_direction: "gte" },
      { id: "upsell", slug: "upsell", goal_direction: "gte" },
      {
        id: "increase",
        slug: "mrr_increase",
        goal_direction: "gte",
        component_category_ids: ["new", "recovered", "upsell"],
      },
    ];
    const gs = [
      ...goals,
      { category_id: "recovered", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 50 },
      { category_id: "upsell", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 25 },
      { category_id: "increase", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 175 },
    ];
    const factors = buildScenarioFactors(gs, cats, 0, { month: "2026-08", value: 1000 }, BASELINES);
    const adjusted = (id: string, original: number) => original * (factors.get(`${id}|2026-09`) ?? 1);
    const componentTotal = adjusted("new", 100) + adjusted("recovered", 50) + adjusted("upsell", 25);
    expect(adjusted("increase", 175)).toBeCloseTo(componentTotal);
  });

  it("faz MRR Decrease ser a soma ajustada de Churn MRR e Downsell", () => {
    const cats = [
      ...categories,
      { id: "downsell", slug: "downsell", goal_direction: "lte" },
      {
        id: "decrease",
        slug: "mrr_decrease",
        goal_direction: "lte",
        component_category_ids: ["churn", "downsell"],
      },
    ];
    const gs = [
      ...goals,
      { category_id: "downsell", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 10 },
      { category_id: "decrease", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 60 },
    ];
    const factors = buildScenarioFactors(gs, cats, 0, { month: "2026-08", value: 1000 }, BASELINES);
    const adjusted = (id: string, original: number) => original * (factors.get(`${id}|2026-09`) ?? 1);
    const componentTotal = adjusted("churn", 50) + adjusted("downsell", 10);
    expect(adjusted("decrease", 60)).toBeCloseTo(componentTotal);
  });

  it("aplica a revisão às categorias independentes e mantém agosto congelado", () => {
    const cats = [
      ...categories,
      { id: "retention", slug: "retencao", goal_direction: "gte" },
      { id: "churnRate", slug: "churn-rate-logos", goal_direction: "lte" },
    ];
    const gs = [
      ...goals,
      { category_id: "retention", period_start: "2026-08-01", period_end: "2026-08-31", target_mrr: 20 },
      { category_id: "retention", period_start: "2026-09-01", period_end: "2026-09-30", target_mrr: 20 },
      { category_id: "churnRate", period_start: "2026-09-01", period_end: "2026-09-30", target_pct: 5 },
    ];
    const factors = buildScenarioFactors(gs, cats, 0, { month: "2026-08", value: 1000 }, BASELINES);
    expect(factors.get("retention|2026-08")).toBe(1);
    expect(factors.get("retention|2026-09")).toBeCloseTo(1.012, 6);
    expect(factors.get("churnRate|2026-09")).toBeCloseTo(0.988, 6);
  });
