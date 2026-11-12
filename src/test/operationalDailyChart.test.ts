import { describe, it, expect } from "vitest";
import { buildDailyChartRows } from "@/lib/operationalDailyChart";

describe("buildDailyChartRows", () => {
  const days = [
    { day: "2026-11-06", target: 100, realized: 150 }, // sexta
    { day: "2026-11-07", target: 100, realized: 20 },  // sábado
    { day: "2026-11-09", target: 100, realized: 50 },
    { day: "2026-11-10", target: 100, realized: null },
  ];
  it("zera meta em fim de semana", () => {
    expect(buildDailyChartRows(days, false)[1].target).toBe(0);
  });
  it("acumulado do realizado soma os dias com dado", () => {
    const rows = buildDailyChartRows(days, false);
    expect(rows[2].cumRealized).toBe(220);
    expect(rows[3].cumRealized).toBeNull();
    expect(rows[3].cumTarget).toBe(300);
  });
  it("no churn, bater a meta é ficar abaixo", () => {
    const rows = buildDailyChartRows(days, true);
    expect(rows[0].hit).toBe(false);
    expect(rows[2].hit).toBe(true);
  });
});
