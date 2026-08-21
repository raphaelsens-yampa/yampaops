import { describe, expect, it } from "vitest";
import { netMrrIncludingYampa20 } from "@/lib/netMrr";

describe("netMrrIncludingYampa20", () => {
  it("increases Net MRR by the current 2.0 balance", () => {
    const yampaFinOnly = 329491.18 - 324828.55;
    const consolidated = netMrrIncludingYampa20(329491.18, 2056.27, 324828.55);

    expect(yampaFinOnly).toBeCloseTo(4662.63, 2);
    expect(consolidated).toBeCloseTo(6718.9, 2);
    expect(consolidated).toBeGreaterThan(yampaFinOnly);
  });

  it("does not subtract the prior legacy balance", () => {
    const consolidated = netMrrIncludingYampa20(329491.18, 2056.27, 324828.55);
    const incorrectLegacyDelta = (329491.18 + 2056.27) - (324828.55 + 2812.65);

    expect(consolidated).not.toBeCloseTo(incorrectLegacyDelta, 2);
  });
});