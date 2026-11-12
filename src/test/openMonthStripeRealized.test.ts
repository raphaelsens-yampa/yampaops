import { describe, it, expect } from "vitest";
import { openMonthSalesFromStripe } from "@/lib/openMonthStripeRealized";

describe("openMonthSalesFromStripe", () => {
  it("separa novas, recuperados e upsell líquido; ignora downgrade", () => {
    const r = openMonthSalesFromStripe([
      { conversion_type: "new", is_reactivation: false, mrr: 200, mrr_net: 180, delta_mrr: 180 },
      { conversion_type: "new", is_reactivation: true, mrr: 100, mrr_net: null, delta_mrr: 100 },
      { conversion_type: "upsell", is_reactivation: false, mrr: 500, mrr_net: 500, delta_mrr: 150 },
      { conversion_type: "downgrade", is_reactivation: false, mrr: 129, mrr_net: 129, delta_mrr: -69.5 },
    ]);
    expect(r).toEqual({ new_mrr: 180, recuperados: 100, upsell: 150 });
  });
});
