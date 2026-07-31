import { describe, expect, it } from "vitest";
import { adjustedDailyTarget, computeRevisedTargets } from "@/lib/revisedGoals";

const t = (entries: [string, number][]) => new Map(entries);

describe("computeRevisedTargets", () => {
  it("dilui o déficit nos meses restantes do trimestre", () => {
    const res = computeRevisedTargets({
      targetByCatMonth: t([["c|6", 100], ["c|7", 100], ["c|8", 100]]),
      realizedByCatMonth: t([["c|6", 70]]),
      categoryIds: ["c"],
      currentMonthIdx: 7, // Julho encerrado, Ago/Set abertos
    });
    expect(res.revisedByCatMonth.get("c|7")).toBe(115);
    expect(res.revisedByCatMonth.get("c|8")).toBe(115);
    expect(res.addedByCatMonth.get("c|7")).toBe(15);
  });

  it("ignora superávit", () => {
    const res = computeRevisedTargets({
      targetByCatMonth: t([["c|6", 100], ["c|7", 100], ["c|8", 100]]),
      realizedByCatMonth: t([["c|6", 130]]),
      categoryIds: ["c"],
      currentMonthIdx: 7,
    });
    expect(res.revisedByCatMonth.get("c|7")).toBe(100);
  });

  it("inverte a lógica para categorias 'menor é melhor'", () => {
    const res = computeRevisedTargets({
      targetByCatMonth: t([["c|6", 100], ["c|7", 100], ["c|8", 100]]),
      realizedByCatMonth: t([["c|6", 120]]),
      categoryIds: ["c"],
      currentMonthIdx: 7,
      lowerIsBetter: () => true,
    });
    expect(res.revisedByCatMonth.get("c|7")).toBe(90);
    expect(res.revisedByCatMonth.get("c|8")).toBe(90);
  });

  it("marca déficit não recuperável no último mês do trimestre", () => {
    const res = computeRevisedTargets({
      targetByCatMonth: t([["c|6", 100], ["c|7", 100], ["c|8", 100]]),
      realizedByCatMonth: t([["c|6", 50], ["c|7", 50], ["c|8", 50]]),
      categoryIds: ["c"],
      currentMonthIdx: 9, // trimestre inteiro encerrado
    });
    expect(res.unrecoveredByCatQuarter.get("c|2")).toBe(150);
    expect(res.revisedByCatMonth.get("c|8")).toBe(100);
  });
});

describe("adjustedDailyTarget", () => {
  it("aumenta o ritmo quando o mês está atrasado", () => {
    const v = adjustedDailyTarget({
      dailyTarget: 3,
      realizedBeforeToday: 10,
      businessDaysInMonth: 22,
      remainingBusinessDays: 11,
    });
    expect(v).toBeCloseTo((66 - 10) / 11);
  });

  it("retorna 0 quando a meta do mês já foi superada", () => {
    const v = adjustedDailyTarget({
      dailyTarget: 3,
      realizedBeforeToday: 100,
      businessDaysInMonth: 22,
      remainingBusinessDays: 5,
    });
    expect(v).toBe(0);
  });
});
