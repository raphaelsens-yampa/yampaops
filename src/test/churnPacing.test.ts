import { describe, it, expect } from "vitest";
import { churnRowOrigin } from "@/components/goals/tactical/useChurnPacing";
describe("churnRowOrigin", () => {
  it("4blue pela flag ou pela origem; demais Yampa", () => {
    expect(churnRowOrigin({ is_4blue_customer: true })).toBe("4blue");
    expect(churnRowOrigin({ origem_cliente: "4Blue" })).toBe("4blue");
    expect(churnRowOrigin({ origem_cliente: "Yampa" })).toBe("yampa");
  });
});
