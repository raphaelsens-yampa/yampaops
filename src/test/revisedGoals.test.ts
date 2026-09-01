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
  });

  it("congela a revisão dos meses encerrados (não recalcula o passado)", () => {
    const input = {
      targetByCatMonth: t([["c|6", 100], ["c|7", 100], ["c|8", 100]]),
      realizedByCatMonth: t([["c|6", 70], ["c|7", 70]]),
      categoryIds: ["c"],
    };
    const durante = computeRevisedTargets({ ...input, currentMonthIdx: 7 });
    const depois = computeRevisedTargets({ ...input, currentMonthIdx: 9 });
    // Agosto manteve a meta revisada que valeu durante o mês
    expect(durante.revisedByCatMonth.get("c|7")).toBe(115);
    expect(depois.revisedByCatMonth.get("c|7")).toBe(115);
    // Setembro absorve os déficits de julho e agosto (30 + 45)
    expect(depois.revisedByCatMonth.get("c|8")).toBeCloseTo(175);
  });

  it("herda o déficit de outra categoria (fluxo amarrado ao estoque)", () => {
    const res = computeRevisedTargets({
      targetByCatMonth: t([["stock|6", 1000], ["stock|7", 1100], ["net|6", 100], ["net|7", 100]]),
      realizedByCatMonth: t([["stock|6", 900], ["net|6", 10]]),
      categoryIds: ["stock", "net"],
      currentMonthIdx: 7,
      deficitSourceFor: (id) => (id === "net" ? "stock" : id),
    });
    const addStock = res.addedByCatMonth.get("stock|7") ?? 0;
    expect(addStock).toBeCloseTo(100);
    expect(res.addedByCatMonth.get("net|7")).toBeCloseTo(addStock);
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
