import { describe, expect, it } from "vitest";
import { computeRevisedWeeklyTargets, type WeeklyRevisionInput } from "@/lib/revisedGoals";

const w = (
  businessDays: number,
  originalTarget: number | null,
  realized: number | null,
  status: WeeklyRevisionInput["status"],
): WeeklyRevisionInput => ({ businessDays, originalTarget, realized, status });

describe("computeRevisedWeeklyTargets", () => {
  it("mantém semanas fechadas e a vigente, rateando o saldo nas futuras por dias úteis", () => {
    const res = computeRevisedWeeklyTargets({
      monthTarget: 1000,
      weeks: [
        w(5, 250, 200, "closed"),
        w(5, 250, 250, "current"),
        w(5, 250, null, "future"),
        w(5, 250, null, "future"),
      ],
    });
    expect(res.weeks[0].revisedTarget).toBe(250);
    expect(res.weeks[1].revisedTarget).toBe(250);
    // saldo = 1000 - 200 - 250 = 550, rateado 50/50
    expect(res.weeks[2].revisedTarget).toBeCloseTo(275);
    expect(res.weeks[3].revisedTarget).toBeCloseTo(275);
    expect(res.weeks[2].delta).toBeCloseTo(25);
  });

  it("reduz as semanas futuras quando houve excedente", () => {
    const res = computeRevisedWeeklyTargets({
      monthTarget: 1000,
      weeks: [
        w(5, 250, 400, "closed"),
        w(5, 250, 0, "current"),
        w(5, 250, null, "future"),
        w(5, 250, null, "future"),
      ],
    });
    expect(res.weeks[2].revisedTarget).toBeCloseTo(175);
    expect(res.weeks[3].delta).toBeCloseTo(-75);
  });

  it("rateia proporcionalmente semanas com dias úteis diferentes", () => {
    const res = computeRevisedWeeklyTargets({
      monthTarget: 600,
      weeks: [w(5, 500, 500, "closed"), w(5, 50, null, "future"), w(1, 50, null, "future")],
    });
    expect(res.weeks[1].revisedTarget).toBeCloseTo((100 * 5) / 6);
    expect(res.weeks[2].revisedTarget).toBeCloseTo((100 * 1) / 6);
  });

  it("nunca vai abaixo de zero e marca resíduo sem semana futura", () => {
    const res = computeRevisedWeeklyTargets({
      monthTarget: 1000,
      weeks: [w(5, 500, 200, "closed"), w(5, 500, 100, "current")],
    });
    expect(res.unrecovered).toBeCloseTo(300);
    expect(res.weeks[1].revisedTarget).toBe(500);
  });

  it("inverte a lógica para categorias teto (menor é melhor)", () => {
    const res = computeRevisedWeeklyTargets({
      monthTarget: 1000,
      lowerIsBetter: true,
      weeks: [w(5, 500, 900, "closed"), w(5, 500, null, "future")],
    });
    // limite consumido: só resta 100
    expect(res.weeks[1].revisedTarget).toBeCloseTo(100);
  });

  it("ignora revisão quando não há meta do mês", () => {
    const res = computeRevisedWeeklyTargets({
      monthTarget: 0,
      weeks: [w(5, null, 10, "closed"), w(5, null, null, "future")],
    });
    expect(res.weeks[1].revisedTarget).toBeNull();
  });
});
