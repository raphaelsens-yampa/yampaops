import { describe, it, expect } from "vitest";
import { crossSellStockAt, isCrossSellPlan, type BpoSale } from "./crossSell";
const sale = (o: Partial<BpoSale>): BpoSale => ({ customer_email: "a@x.com", stripe_subscription_id: "sub_a", conversion_type: "new", mrr: 299, mrr_net: 299, delta_mrr: 299, date: "2026-03-10", ...o });
describe("cross-sell stock", () => {
  it("keeps counting in following months", () => expect(crossSellStockAt([sale({})], [], "2026-06-30")).toEqual({ mrr: 299, accounts: 1 }));
  it("upsell counts only the add-on", () => expect(crossSellStockAt([sale({ conversion_type: "upsell", mrr: 699, mrr_net: 699, delta_mrr: 634 })], [], "2026-11-30").mrr).toBe(634));
  it("stops after churn", () => expect(crossSellStockAt([sale({})], [{ stripe_subscription_id: "sub_a", customer_email: null, date: "2026-05-02" }], "2026-05-31").accounts).toBe(0));
  it("not before the sale", () => expect(crossSellStockAt([sale({})], [], "2026-02-28").accounts).toBe(0));
  it("Time Financeiro is not cross-sell", () => { expect(isCrossSellPlan("Time Financeiro com BPO Junior")).toBe(false); expect(isCrossSellPlan("BPO Pleno")).toBe(true); });
});
