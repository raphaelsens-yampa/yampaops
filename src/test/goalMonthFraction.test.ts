import { describe, expect, it } from "vitest";
import { goalMonthFraction } from "@/components/goals/tactical/useCategoryWeeklyData";

describe("goalMonthFraction", () => {
  it("mantém 100% para uma meta mensal", () => {
    expect(goalMonthFraction("2026-09-01", "2026-09-30", "2026-09-01", "2026-09-30")).toBe(1);
  });

  it("rateia metas que atravessam mais de um mês como Acompanhamento Metas", () => {
    expect(goalMonthFraction("2026-09-16", "2026-10-15", "2026-09-01", "2026-09-30")).toBe(0.5);
  });
});