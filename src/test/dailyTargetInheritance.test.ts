import { describe, it, expect } from "vitest";
import { resolveDailyTargetInfo, type TacticalGoal } from "@/components/goals/tactical/types";

const g = (p: Partial<TacticalGoal>): TacticalGoal => ({
  id: Math.random().toString(36).slice(2),
  metric_id: "m1",
  user_id: null,
  team_id: null,
  daily_target: 1,
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  created_at: "2026-07-31T00:00:00Z",
  ...p,
});

describe("resolveDailyTargetInfo", () => {
  it("meta vigente vence a herdada", () => {
    const goals = [
      g({ daily_target: 3, period_start: "2026-08-01", period_end: "2026-08-31" }),
      g({ daily_target: 5, period_start: "2026-09-01", period_end: "2026-09-30" }),
    ];
    const r = resolveDailyTargetInfo(goals, "m1", null, null, "2026-09-02");
    expect(r.value).toBe(5);
    expect(r.source).toBe("current");
  });

  it("herda a meta de period_end mais recente quando não há vigente", () => {
    const goals = [
      g({ daily_target: 2, period_start: "2026-07-01", period_end: "2026-07-31" }),
      g({ daily_target: 3, period_start: "2026-08-01", period_end: "2026-08-31" }),
    ];
    const r = resolveDailyTargetInfo(goals, "m1", null, null, "2026-09-02");
    expect(r.value).toBe(3);
    expect(r.source).toBe("inherited");
    expect(r.goal?.period_end).toBe("2026-08-31");
  });

  it("respeita a precedência pessoa → time → equipe toda nas metas vigentes", () => {
    const goals = [
      g({ daily_target: 10, user_id: "u1", period_start: "2026-09-01", period_end: "2026-09-30" }),
      g({ daily_target: 7, team_id: "t1", period_start: "2026-09-01", period_end: "2026-09-30" }),
      g({ daily_target: 1, period_start: "2026-09-01", period_end: "2026-09-30" }),
    ];
    expect(resolveDailyTargetInfo(goals, "m1", "u1", "t1", "2026-09-02").value).toBe(10);
    expect(resolveDailyTargetInfo(goals, "m1", "u2", "t1", "2026-09-02").value).toBe(7);
    expect(resolveDailyTargetInfo(goals, "m1", "u2", "t2", "2026-09-02").value).toBe(1);
  });

  it("meta global vigente vence meta de pessoa encerrada", () => {
    const goals = [
      g({ daily_target: 10, user_id: "u1", period_start: "2026-08-01", period_end: "2026-08-31" }),
      g({ daily_target: 4, period_start: "2026-09-01", period_end: "2026-09-30" }),
    ];
    const r = resolveDailyTargetInfo(goals, "m1", "u1", null, "2026-09-02");
    expect(r.value).toBe(4);
    expect(r.source).toBe("current");
  });

  it("sem nenhuma meta anterior retorna 0", () => {
    const goals = [
      g({ daily_target: 9, period_start: "2026-10-01", period_end: "2026-10-31" }),
    ];
    const r = resolveDailyTargetInfo(goals, "m1", null, null, "2026-09-02");
    expect(r.value).toBe(0);
    expect(r.source).toBe("none");
  });
});
