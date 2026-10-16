import { describe, it, expect } from "vitest";
import { realizedOf, targetOf, attainment, attainmentTone, arpa } from "@/lib/onePage";

describe("OnePage Diretoria", () => {
  it("ativos usam quantidade e MRR usa valor", () => {
    expect(realizedOf({ metric_key: "ativos_pagantes", year_month: "2026-10-01", category_id: null, realized_amount: 1, deals_count: 2205 })).toBe(2205);
    expect(realizedOf({ metric_key: "total_mrr", year_month: "2026-10-01", category_id: null, realized_amount: 333238.2, deals_count: 2205 })).toBe(333238.2);
  });
  it("meta usa R$ e, sem valor, a quantidade", () => {
    expect(targetOf({ category_id: "a", period_start: "2026-10-01", target_mrr: 0, target_deals: 2384 })).toBe(2384);
    expect(targetOf({ category_id: "a", period_start: "2026-10-01", target_mrr: 0, target_deals: 0 })).toBeNull();
  });
  it("churn acima da meta é ruim; vendas acima da meta é bom", () => {
    expect(attainmentTone("churn_mrr", attainment(18000, 15000))).toBe("down");
    expect(attainmentTone("new_mrr", attainment(13000, 12000))).toBe("up");
  });
  it("ARPA = MRR ÷ ativos", () => {
    expect(arpa(333238.2, 2205)).toBeCloseTo(151.13, 2);
  });
});
