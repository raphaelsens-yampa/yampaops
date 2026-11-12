import { describe, it, expect } from "vitest";
import { salesTargetForRange, isCountedSale, salesCountForRange, dailySalesTarget } from "@/lib/operationalSalesCount";

const goals = [{ period_start: "2026-11-01", period_end: "2026-11-30", daily_target: 5.5 }];

describe("operationalSalesCount", () => {
  it("soma meta só em dias úteis e arredonda .5 para cima", () => {
    // 09–13/11/2026 = 5 dias úteis × 5,5 = 27,5 → 28; fim de semana não soma
    expect(salesTargetForRange(goals, "2026-11-08", "2026-11-14")).toBe(28);
  });
  it("herda a última meta anterior quando o mês não tem cadastro", () => {
    expect(dailySalesTarget(goals, "2026-12-02")).toBe(5.5);
    expect(salesTargetForRange([], "2026-11-01", "2026-11-30")).toBeNull();
  });
  it("conta novas e recuperados FT, não upsell", () => {
    expect(isCountedSale({ conversion_type: "new" })).toBe(true);
    expect(isCountedSale({ conversion_type: "reactivation", is_reactivation: true })).toBe(true);
    expect(isCountedSale({ conversion_type: "upsell" })).toBe(false);
  });
  it("soma realizado no intervalo", () => {
    const m = new Map([["2026-11-10", 2], ["2026-11-12", 3], ["2026-11-20", 4]]);
    expect(salesCountForRange(m, "2026-11-08", "2026-11-14")).toBe(5);
  });
});
