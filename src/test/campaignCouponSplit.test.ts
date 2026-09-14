import { describe, expect, it } from "vitest";
import { splitCanonicalCouponValue } from "@/components/goals/tactical/campaignCoupons";

describe("splitCanonicalCouponValue", () => {
  it("mantém Campanha + Não-campanha igual ao Tudo em cada período", () => {
    for (const [total, raw] of [[1000, 300], [400, 700], [250, 0], [0, 80]]) {
      const split = splitCanonicalCouponValue(total, raw);
      expect(split.campaign + split.nonCampaign).toBe(total);
      expect(split.campaign).toBeLessThanOrEqual(total);
      expect(split.nonCampaign).toBeGreaterThanOrEqual(0);
    }
  });

  it("não transporta excesso de campanha para o período seguinte", () => {
    const first = splitCanonicalCouponValue(100, 150);
    const second = splitCanonicalCouponValue(200, 0);
    expect(first).toEqual({ campaign: 100, nonCampaign: 0 });
    expect(second).toEqual({ campaign: 0, nonCampaign: 200 });
  });
});