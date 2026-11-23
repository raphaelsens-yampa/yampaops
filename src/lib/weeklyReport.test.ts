import { describe, it, expect } from "vitest";
import { lastClosedWeek, businessDays, summarizeSales, summarizeChurn, pace, monthBounds, type SaleRow } from "./weeklyReport";

const sale = (p: Partial<SaleRow>): SaleRow => ({ day: "2026-11-17", conversion_type: "new", is_reactivation: false, mrr: 100, mrr_net: 100, delta_mrr: null, area: "sales", assigned_seller_id: null, origem_cliente: null, attribution_source: null, ...p });

describe("weeklyReport", () => {
  it("semana fechada anterior é segunda a domingo", () => {
    expect(lastClosedWeek("2026-11-23")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(lastClosedWeek("2026-11-22")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
  });
  it("dias úteis e limites do mês", () => {
    expect(businessDays("2026-11-16", "2026-11-22")).toBe(5);
    expect(monthBounds("2026-11-23")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });
  it("upsell soma só o delta e não conta como venda", () => {
    const s = summarizeSales([sale({}), sale({ conversion_type: "upsell", delta_mrr: 50, mrr: 300 }), sale({ is_reactivation: true, mrr_net: 80 }), sale({ day: "2026-11-30" })], { start: "2026-11-16", end: "2026-11-22" });
    expect(s).toEqual({ novos: 100, recuperados: 80, upsell: 50, newMrr: 230, qty: 2 });
  });
  it("filtro 4blue usa a origem da venda", () => {
    const s = summarizeSales([sale({}), sale({ origem_cliente: "4blue", mrr_net: 65 })], { start: "2026-11-16", end: "2026-11-22" }, "4blue");
    expect(s.newMrr).toBe(65);
  });
  it("churn conta logos distintos", () => {
    expect(summarizeChurn([{ day: "2026-11-17", mrr: 10, company: "a", origem_cliente: "yampa" }, { day: "2026-11-18", mrr: 5, company: "a", origem_cliente: "yampa" }], { start: "2026-11-16", end: "2026-11-22" })).toEqual({ mrr: 15, logos: 1 });
  });
  it("pace por dias úteis", () => {
    expect(pace(2100, 700, 7, 21)).toMatchObject({ expected: 700, trend: 2100 });
  });
});

describe("recuperados padronizados", () => {
  it("soma reativação Stripe + recuperação oficial do CS na origem", () => {
    const s = summarizeSales([sale({ is_reactivation: true, mrr_net: 80 })], { start: "2026-11-16", end: "2026-11-22" }, "yampa",
      [{ day: "2026-11-18", mrr: 200, origin: "yampa" }, { day: "2026-11-18", mrr: 65, origin: "4blue" }, { day: "2026-11-25", mrr: 999, origin: "yampa" }]);
    expect(s.recuperados).toBe(280);
    expect(s.newMrr).toBe(280);
  });
});
