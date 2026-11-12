import { describe, it, expect } from "vitest";
import { recoveryOrigin } from "@/components/goals/tactical/useNewMrrPacing";
describe("recoveryOrigin", () => {
  it("4blue marcado conta como 4blue", () => expect(recoveryOrigin({ origem_cliente: "4blue" })).toBe("4blue"));
  it("sem marcação conta como Yampa", () => expect(recoveryOrigin({ origem_cliente: null })).toBe("yampa"));
});
