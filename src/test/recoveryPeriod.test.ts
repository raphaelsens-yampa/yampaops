import { describe, expect, it } from "vitest";
import { recoveryPresetRange, recoveryRangeError, recoveryComparison } from "@/lib/recoveryPeriod";
const date = (key: string) => new Date(`${key}T12:00:00`);
describe("Recovery period rules", () => {
  it("current month starts October 1 and ends today October 19", () => {
    const range = recoveryPresetRange("month", date("2026-10-19"));
    expect(range.from.getDate()).toBe(1);
    expect(range.from.getMonth()).toBe(9);
    expect(range.to.getDate()).toBe(19);
  });
  it("current quarter starts July 1 for September 15", () => {
    const range = recoveryPresetRange("quarter", date("2026-09-15"));
    expect([range.from.getFullYear(), range.from.getMonth(), range.from.getDate()]).toEqual([2026, 6, 1]);
    expect(range.to.getDate()).toBe(15);
  });
  it("accepts a historical full year and rejects a larger inclusive interval", () => {
    expect(recoveryRangeError({ from: date("2025-01-01"), to: date("2025-12-31") })).toBeNull();
    expect(recoveryRangeError({ from: date("2025-01-01"), to: date("2026-01-01") })).not.toBeNull();
    expect(recoveryRangeError({ from: date("2024-01-01"), to: date("2024-12-31") })).toBeNull();
  });
  it("rejects reversed dates", () => {
    expect(recoveryRangeError({ from: date("2026-06-30"), to: date("2026-04-01") })).not.toBeNull();
  });
  it("historical Q2 includes 91 days and an equally long previous period", () => {
    const result = recoveryComparison({ from: date("2026-04-01"), to: date("2026-06-30") });
    expect(result.dates).toHaveLength(91);
    expect(result.dates[90]).toBe("2026-06-30");
    expect(result.prevFrom.getMonth()).toBe(11);
    expect(result.prevFrom.getFullYear()).toBe(2025);
    expect(result.prevTo.getDate()).toBe(31);
  });
});