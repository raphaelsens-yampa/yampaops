import { describe, expect, it } from "vitest";
import {
  addMonths,
  averageFunnelKpis,
  averageOf,
  buildCoverage,
  buildPlanMonths,
  buildQuotaShares,
  growthPctForMonth,
  newMrrFromConversions,
  planWindow,
  type RealizedMonth,
} from "@/lib/commercialPlan";

describe("growthPctForMonth", () => {
  it("usa o último baseline aplicável ao mês", () => {
    const baselines = [
      { effective_month: "2026-01-01", growth_pct: 1 },
      { effective_month: "2026-09-01", growth_pct: 1.2 },
    ];
    expect(growthPctForMonth(baselines as any, "2026-09")).toBe(1.2);
    expect(growthPctForMonth(baselines as any, "2026-08")).toBe(1);
  });

  it("sem baseline aplicável usa o primeiro cadastrado; sem baselines, zero", () => {
    const baselines = [{ effective_month: "2026-09-01", growth_pct: 2 }];
    expect(growthPctForMonth(baselines as any, "2026-05")).toBe(2);
    expect(growthPctForMonth([], "2026-05")).toBe(0);
  });
});

describe("planWindow", () => {
  it("monta 3 meses de histórico + vigente + 12 à frente", () => {
    const w = planWindow(new Date(2026, 9, 15), 2, 3);
    expect(w).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  });

  it("addMonths atravessa o ano", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
  });
});

describe("buildPlanMonths", () => {
  const realized: RealizedMonth[] = [
    { yearMonth: "2026-09", newMrr: 12000, churnMrr: 8000, netMrr: 4000, totalMrr: 300000, ativos: 2200 },
  ];

  it("extrapola o New MRR pela taxa da base de crescimento", () => {
    const rows = buildPlanMonths({
      window: ["2026-10", "2026-11"],
      realized,
      baselines: [{ effective_month: "2026-10-01", growth_pct: 1.2 }],
      overrides: {},
      avgChurn: 8000,
      avgTicket: 300,
    });
    const out = rows[0];
    expect(out.mrrStart).toBe(300000);
    expect(out.mrrEnd).toBeCloseTo(300000 * 1.012, 6);
    expect(out.newMrrTarget).toBeCloseTo(300000 * 0.012 + 8000, 6);
    expect(out.churnMrrTarget).toBe(8000);
    expect(out.dealsTarget).toBe(Math.round((out.newMrrTarget as number) / 300));
    expect(out.source).toBe("generated");
    // encadeia: 2ª linha parte do fim previsto da 1ª
    expect(rows[1].mrrStart).toBeCloseTo(300000 * 1.012, 6);
  });

  it("override define o New MRR e recalcula o fim do mês", () => {
    const rows = buildPlanMonths({
      window: ["2026-10"],
      realized,
      baselines: [{ effective_month: "2026-10-01", growth_pct: 1.2 }],
      overrides: { "2026-10": { target_new_mrr: 20000, target_churn_mrr: null, target_deals: null, target_ativos: null } },
      avgChurn: 8000,
    });
    const out = rows[0];
    expect(out.newMrrTarget).toBe(20000);
    expect(out.mrrEnd).toBe(300000 + 20000 - 8000);
    expect(out.source).toBe("override");
  });

  it("continua do realizado real quando o mês tem apuração", () => {
    const rows = buildPlanMonths({
      window: ["2026-09", "2026-10"],
      realized: [...realized, { yearMonth: "2026-10", newMrr: 9000, churnMrr: 7000, netMrr: 2000, totalMrr: 302000, ativos: 2205 }],
      baselines: [],
      overrides: {},
      avgChurn: 7500,
      overrideGrowthPct: 0,
    });
    expect(rows[0].mrrEnd).toBe(300000);
    expect(rows[1].mrrStart).toBe(300000);
    // sem crescimento, o New MRR alvo cobre apenas o churn previsto
    expect(rows[1].newMrrTarget).toBe(7500);
    expect(rows[1].mrrEnd).toBe(302000); // ancora no realizado
  });

  it("mês aberto não reancora a cadeia (projetar sobre fechado)", () => {
    const rows = buildPlanMonths({
      window: ["2026-10", "2026-11"],
      realized: [
        { yearMonth: "2026-09", newMrr: 12000, churnMrr: 8000, netMrr: 4000, totalMrr: 300000, ativos: 2200 },
        { yearMonth: "2026-10", newMrr: 9000, churnMrr: 7000, netMrr: 2000, totalMrr: 295000, ativos: 2190 },
      ],
      baselines: [
        { effective_month: "2026-10-01", growth_pct: 1.5 },
        { effective_month: "2026-11-01", growth_pct: 3 },
      ],
      overrides: {},
      closedThrough: "2026-09",
      avgChurn: 7500,
    });
    // Out projeta sobre Set fechado; o realizado parcial só aparece na coluna Realizado.
    expect(rows[0].mrrEnd).toBeCloseTo(300000 * 1.015, 6);
    expect(rows[0].realized?.totalMrr).toBe(295000);
    expect(rows[0].newMrrTarget).toBeCloseTo(300000 * 0.015 + 7500, 6);
    // Nov parte do fim projetado de Out, não do realizado parcial.
    expect(rows[1].mrrStart).toBeCloseTo(300000 * 1.015, 6);
    expect(rows[1].mrrEnd).toBeCloseTo(300000 * 1.015 * 1.03, 6);
  });
});


describe("newMrrFromConversions", () => {
  it("soma new/reactivation pelo mrr_net e upsell pelo delta", () => {
    expect(newMrrFromConversions([
      { mrr: 300, mrr_net: 279, delta_mrr: null, conversion_type: "new" },
      { mrr: 300, mrr_net: 279, delta_mrr: null, conversion_type: null, is_reactivation: true },
      { mrr: 399, mrr_net: 399, delta_mrr: 160, conversion_type: "upsell" },
      { mrr: 399, mrr_net: 399, delta_mrr: -50, conversion_type: "upsell" },
    ])).toBe(279 + 279 + 160);
  });

  it("ignora downgrade/renewal", () => {
    expect(newMrrFromConversions([
      { mrr: 100, mrr_net: 100, delta_mrr: null, conversion_type: "downgrade" },
      { mrr: 100, mrr_net: 100, delta_mrr: null, conversion_type: "renewal" },
    ])).toBe(0);
  });
});

describe("buildQuotaShares", () => {
  const sellers = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];

  it("rateia proporcional ao realizado histórico", () => {
    const rows = buildQuotaShares({
      sellers,
      history: { a: 6000, b: 3000, c: 1000 },
      totalQuota: 20000,
    });
    expect(rows[0].quotaNewMrr).toBeCloseTo(12000, 0);
    expect(rows[1].quotaNewMrr).toBeCloseTo(6000, 0);
    expect(rows[2].quotaNewMrr).toBeCloseTo(2000, 0);
  });

  it("linhas manuais mantêm o valor e o saldo é rateado nas automáticas", () => {
    const rows = buildQuotaShares({
      sellers,
      history: { a: 6000, b: 3000, c: 1000 },
      totalQuota: 20000,
      saved: { c: { quota_new_mrr: 5000, is_manual: true } },
    });
    expect(rows[2].quotaNewMrr).toBe(5000);
    expect(rows[0].quotaNewMrr).toBeCloseTo((20000 - 5000) * 0.6, 0);
  });

  it("sem histórico, quotas ficam zeradas (ajuste manual)", () => {
    const rows = buildQuotaShares({ sellers, history: {}, totalQuota: 10000 });
    expect(rows.every((r) => r.quotaNewMrr === 0)).toBe(true);
  });
});

describe("cobertura de pipeline", () => {
  it("cálculo reverso completo", () => {
    const c = buildCoverage({ dealsNeeded: 10, winRatePct: 20, avgTicket: 300, pipelineCurrent: 9000, targetCoverage: 1 });
    expect(c.entradasNecessarias).toBeCloseTo(50);
    expect(c.pipelineNecessario).toBeCloseTo(15000);
    expect(c.coveragePct).toBeCloseTo(60);
    expect(c.ok).toBe(false);
  });

  it("sem taxa de conversão, cobertura fica indisponível", () => {
    const c = buildCoverage({ dealsNeeded: 10, winRatePct: null, avgTicket: 300, pipelineCurrent: 9000 });
    expect(c.entradasNecessarias).toBeNull();
    expect(c.coveragePct).toBeNull();
    expect(c.ok).toBeNull();
  });

  it("média dos KPIs ignora nulos", () => {
    const avg = averageFunnelKpis([
      { winRate: 20, avgTicket: 300 },
      { winRate: null, avgTicket: null },
      { winRate: 40, avgTicket: 450 },
    ]);
    expect(avg.winRate).toBe(30);
    expect(avg.avgTicket).toBe(375);
  });

  it("averageOf ignora nulos", () => {
    expect(averageOf([1, null, 3])).toBe(2);
    expect(averageOf([])).toBeNull();
  });
});
