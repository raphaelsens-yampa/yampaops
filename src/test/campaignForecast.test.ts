import { describe, expect, it } from "vitest";
import { buildRatios, campaignType, forecastFromInvestment, quantile, reverseForGoal, type CampaignActuals } from "@/lib/campaignForecast";

const c = (id: string, investment: number, sales: number, mrr: number, ltvCac: number): CampaignActuals => ({
  id, name: id, type: "X", channel: null, ref_month: null, investment, sales, mrr, ltvCac, leads: null,
});
const base = [c("a", 10000, 10, 3000, 5), c("b", 20000, 10, 2000, 3), c("c", 0, 5, 100, 2)];

describe("campaignForecast", () => {
  it("extrai o tipo da campanha", () => {
    expect(campaignType("Workshop FC (Aleks)")).toBe("Workshop FC");
    expect(campaignType("Aulão 09/2026")).toBe("Aulão");
    expect(campaignType("Black Friday 2025")).toBe("Black Friday");
  });
  it("quartis", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 3], 0.25)).toBe(1.5);
  });
  it("ignora campanhas sem investimento e ordena cenários", () => {
    const r = buildRatios(base)!;
    expect(r.esperado.salesPerReal).toBeCloseTo(0.00075);
    expect(r.otimista.salesPerReal).toBeGreaterThanOrEqual(r.esperado.salesPerReal);
    expect(r.pessimista.salesPerReal).toBeLessThanOrEqual(r.esperado.salesPerReal);
  });
  it("previsão direta", () => {
    const f = forecastFromInvestment({ salesPerReal: 0.001, ticket: 300, ltvCac: 4 }, 10000, 100000);
    expect(f.sales).toBe(10);
    expect(f.mrr).toBe(3000);
    expect(f.cac).toBe(1000);
    expect(f.roiPct).toBe(300);
    expect(f.growthPct).toBe(3);
    expect(f.paybackMonths).toBeCloseTo(3.333, 2);
  });
  it("reverso por MRR e por crescimento", () => {
    const r = { salesPerReal: 0.001, ticket: 300, ltvCac: 4 };
    expect(reverseForGoal(r, "mrr", 6000, null, 0).investment).toBe(20000);
    expect(reverseForGoal(r, "growth", 1, 300000, 0).investment).toBe(10000);
  });
  it("reverso por LTV/CAC e ROI", () => {
    const r = { salesPerReal: 0.001, ticket: 300, ltvCac: 4 };
    const a = reverseForGoal(r, "ltv_cac", 5, null, 10000);
    expect(a.maxCac).toBe(800);
    expect(a.meets).toBe(false);
    const b = reverseForGoal(r, "roi", 100, null, 10000);
    expect(b.maxCac).toBe(2000);
    expect(b.meets).toBe(true);
  });
});
