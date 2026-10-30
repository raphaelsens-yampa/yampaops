import { describe, expect, it } from "vitest";
import {
  buildPeriodValues,
  createPeriodTargetResolver,
  formatTacticalPeriod,
  isSingleDayPeriod,
  tacticalBusinessPeriodKeys,
  tacticalPeriodError,
  tacticalPeriodKeys,
  tacticalPresetRange,
  tacticalRealizedWithLowTouch,

  type TacticalPeriod,
} from "@/components/goals/tactical/tacticalPeriod";
import type { DailyDatum, TacticalGoal } from "@/components/goals/tactical/types";

const date = (key: string) => new Date(`${key}T12:00:00`);
const period = (from: string, to: string): TacticalPeriod => ({ from: date(from), to: date(to) });

const goal = (over: Partial<TacticalGoal>): TacticalGoal =>
  ({
    id: "g1",
    metric_id: "m1",
    user_id: null,
    team_id: null,
    daily_target: 6,
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as TacticalGoal;

describe("Tactical period presets", () => {
  it("keeps a single day when the preset is 'day'", () => {
    const p = tacticalPresetRange("day", date("2026-10-30"));
    expect(isSingleDayPeriod(p)).toBe(true);
    expect(tacticalPeriodKeys(p)).toEqual(["2026-10-30"]);
    expect(formatTacticalPeriod(p)).toBe("30/10/2026");
  });

  it("accumulates 7 days ending on the reference date", () => {
    const p = tacticalPresetRange("7", date("2026-10-30"));
    expect(tacticalPeriodKeys(p)).toHaveLength(7);
    expect(tacticalPeriodKeys(p)[0]).toBe("2026-10-24");
    expect(formatTacticalPeriod(p)).toBe("24/10/2026 – 30/10/2026");
  });

  it("uses the current month and quarter up to the reference date", () => {
    expect(tacticalPresetRange("month", date("2026-10-30")).from.getDate()).toBe(1);
    const q = tacticalPresetRange("quarter", date("2026-09-15"));
    expect([q.from.getMonth(), q.from.getDate()]).toEqual([6, 1]);
    expect(tacticalPeriodKeys(q)).toHaveLength(77);
  });

  it("honours an explicit 'de' date in the custom preset", () => {
    const p = tacticalPresetRange("custom", date("2026-10-30"), date("2026-04-01"));
    expect(tacticalPeriodKeys(p)).toHaveLength(213);
    expect(tacticalPeriodKeys(p)[0]).toBe("2026-04-01");
  });
});

describe("Tactical period validation", () => {
  it("accepts a full historical year and rejects anything longer", () => {
    expect(tacticalPeriodError(period("2025-01-01", "2025-12-31"))).toBeNull();
    expect(tacticalPeriodError(period("2025-01-01", "2026-01-01"))).not.toBeNull();
  });

  it("rejects a reversed interval", () => {
    expect(tacticalPeriodError(period("2026-06-30", "2026-04-01"))).not.toBeNull();
  });
});

describe("Tactical period accumulation", () => {
  const daily: DailyDatum[] = [
    { user_id: "u1", metric_id: "m1", date: "2026-10-30", value: 3 },
    { user_id: "u1", metric_id: "m1", date: "2026-10-29", value: 2 },
    { user_id: "u1", metric_id: "m1", date: "2026-09-30", value: 9 },
    { user_id: "u2", metric_id: "m1", date: "2026-10-30", value: 5 },
  ];

  it("sums each day once and never repeats a sale in later months", () => {
    const keys = new Set(tacticalPeriodKeys(period("2026-10-01", "2026-10-30")));
    const values = buildPeriodValues(daily, keys);
    expect(values.get("u1|m1")).toBe(5);
    expect(values.get("u2|m1")).toBe(5);
    expect(values.has("u1|m1|2026-09")).toBe(false);
  });

  it("keeps a September sale out of an October period", () => {
    const keys = new Set(tacticalPeriodKeys(period("2026-10-01", "2026-10-30")));
    expect(buildPeriodValues(daily, keys).get("u1|m1")).not.toBe(14);
  });

  it("accumulates the daily goal over business days only", () => {
    const resolve = createPeriodTargetResolver([goal({ daily_target: 6 })]);
    const p = period("2026-10-26", "2026-11-01");
    const business = tacticalBusinessPeriodKeys(p);
    expect(business).toHaveLength(5);
    expect(resolve("m1", "u1", null, business)).toBe(30);
  });

  it("resolves the goal per day, so a mid-period change is honoured", () => {
    const resolve = createPeriodTargetResolver([
      goal({ daily_target: 6, period_end: "2026-10-30" }),
      goal({ id: "g2", daily_target: 10, period_start: "2026-10-31", period_end: "2026-11-30" }),
    ]);
    // Sex 30/10 (meta 6) + Seg 02/11 (meta 10); sáb/dom não contam.
    const p = period("2026-10-30", "2026-11-02");
    expect(tacticalBusinessPeriodKeys(p)).toEqual(["2026-10-30", "2026-11-02"]);
    expect(resolve("m1", "u1", null, tacticalBusinessPeriodKeys(p))).toBe(16);
  });
});

describe("Low-touch nas metas de venda", () => {
  it("soma as vendas low-touch em Vendas do dia", () => {
    expect(tacticalRealizedWithLowTouch("vendas_dia", 5, { sales: 3, upsells: 2 })).toBe(8);
  });

  it("soma os upsells low-touch em Clientes Upsell", () => {
    expect(tacticalRealizedWithLowTouch("upsell_dia", 4, { sales: 3, upsells: 2 })).toBe(6);
  });

  it("não duplica o low-touch em outras métricas", () => {
    expect(tacticalRealizedWithLowTouch("mrr_dia", 100, { sales: 3, upsells: 2 })).toBe(100);
    expect(tacticalRealizedWithLowTouch("clientes_recuperados", 2, { sales: 3, upsells: 2 })).toBe(2);
  });

  it("mantém o realizado quando não há low-touch no período", () => {
    expect(tacticalRealizedWithLowTouch("vendas_dia", 5, { sales: 0, upsells: 0 })).toBe(5);
  });
});

