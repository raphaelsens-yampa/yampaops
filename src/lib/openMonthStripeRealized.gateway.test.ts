import { describe, it, expect } from "vitest";
import { conversionGateway } from "./openMonthStripeRealized";

describe("conversionGateway", () => {
  it("vindi ids", () => expect(conversionGateway({ stripe_event_id: "vindi_123" })).toBe("vindi"));
  it("4blue ids", () => expect(conversionGateway({ stripe_event_id: "4blue:a@b.com:2026-11-01" })).toBe("4blue"));
  it("4blue source", () => expect(conversionGateway({ stripe_event_id: "x", attribution_source: "metabase_4blue" })).toBe("4blue"));
  it("default stripe", () => expect(conversionGateway({ stripe_event_id: "evt_1" })).toBe("stripe"));
});
