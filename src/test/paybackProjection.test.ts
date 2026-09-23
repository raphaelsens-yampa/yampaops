import { describe, expect, it } from "vitest";
import { buildPaybackProjection, type LifetimeMonthPoint } from "@/lib/campaignCohort";

const history: LifetimeMonthPoint[] = [
  { month_index: 0, month_key: "2026-07", revenue: 100, revenue_cum: 100 },
  { month_index: 1, month_key: "2026-08", revenue: 90, revenue_cum: 190 },
];

describe("buildPaybackProjection", () => {
  it("identifica o primeiro mês em que o payback real foi atingido", () => {
    const result = buildPaybackProjection(history, 150, 90);
    expect(result.status).toBe("achieved");
    expect(result.milestone).toMatchObject({ offset: 1, month_key: "2026-08", projected: false });
    expect(result.points.every((point) => point.projected == null)).toBe(true);
  });

  it("projeta os meses futuros usando o MRR ativo atual", () => {
    const result = buildPaybackProjection(history, 400, 80);
    expect(result.status).toBe("projected");
    expect(result.milestone).toMatchObject({ offset: 4, month_key: "2026-11", projected: true });
    expect(result.points.at(-1)?.projected).toBe(430);
  });

  it("não calcula sem investimento válido", () => {
    expect(buildPaybackProjection(history, null, 80).status).toBe("invalid_investment");
  });

  it("mantém o histórico sem previsão quando não há MRR ativo", () => {
    const result = buildPaybackProjection(history, 400, 0);
    expect(result.status).toBe("no_active_mrr");
    expect(result.points).toHaveLength(2);
    expect(result.milestone).toBeNull();
  });
});