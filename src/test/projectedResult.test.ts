import { describe, it, expect } from "vitest";
import { computeProjectedResult } from "@/components/goals/projectedResultModel";

const base = [
  { email: "a@x", mrr: 100, origin: "yampa" as const },
  { email: "b@x", mrr: 200, origin: "4blue" as const },
  { email: "c@x", mrr: 50, origin: "yampa" as const },
];

describe("Resultado Projetado", () => {
  it("não desconta churn de cliente retido ou recuperado no dia", () => {
    const r = computeProjectedResult(base, [{ email: "a@x", kind: "retained", mrr: 100, previousMrr: 0, origin: "yampa" }],
      [{ email: "a@x", mrr: 100, origin: "yampa", date: "2026-10-31", tipo: "voluntario" },
       { email: "c@x", mrr: 50, origin: "yampa", date: "2026-10-31", tipo: "involuntario" }], "all");
    expect(r.churnMrr).toBe(50);
    expect(r.avoidedQtd).toBe(1);
    expect(r.projectedUsers).toBe(2);
  });

  it("soma vendas e upsell e desconta churn no MRR projetado", () => {
    const r = computeProjectedResult(base, [
      { email: "n@x", kind: "new", mrr: 129, previousMrr: 0, origin: "yampa" },
      { email: "c@x", kind: "upsell", mrr: 80, previousMrr: 50, origin: "yampa" },
    ], [{ email: "b@x", mrr: 200, origin: "4blue", date: "2026-10-31", tipo: "involuntario" }], "all");
    expect(r.projectedMrr).toBe(350 + 129 + 30 - 200);
    expect(r.projectedUsers).toBe(3);
  });

  it("filtra por origem", () => {
    const r = computeProjectedResult(base, [], [], "4blue");
    expect(r.baseMrr).toBe(200);
    expect(r.baseUsers).toBe(1);
  });

  it("lista o churn previsto da data mais recente para a mais antiga", () => {
    const r = computeProjectedResult(base, [], [
      { email: "a@x", mrr: 100, origin: "yampa", date: "2026-10-29", tipo: "involuntario" },
      { email: "b@x", mrr: 200, origin: "4blue", date: "2026-10-31", tipo: "voluntario" },
      { email: "c@x", mrr: 50, origin: "yampa", date: "2026-10-30", tipo: "involuntario" },
    ], "all");
    expect(r.churnCases.map((c) => c.date)).toEqual(["2026-10-31", "2026-10-30", "2026-10-29"]);
  });
});

describe("média de novas vendas (janela em dias úteis)", () => {
  it("soma a média diária das vendas novas ao projetado e respeita origem", async () => {
    const { computeProjectedResult } = await import("@/components/goals/projectedResultModel");
    const recent = [{ mrr: 3000, origin: "yampa" as const }, { mrr: 1500, origin: "yampa" as const }, { mrr: 600, origin: "4blue" as const }];
    const all = computeProjectedResult([], [], [], "all", recent, 30);
    expect(all.mediaVendasMrr).toBe(170);
    expect(all.projectedMrr).toBe(170);
    expect(computeProjectedResult([], [], [], "4blue", recent, 30).mediaVendasMrr).toBe(20);
  });
});

describe("recuperação oficial do Metas Táticas", () => {
  it("soma todo recuperado, mesmo já na base, e não soma retido", () => {
    const r = computeProjectedResult(
      [{ email: "a@x", mrr: 120.73, origin: "yampa" }, { email: "b@x", mrr: 279.02, origin: "yampa" }],
      [
        { email: "a@x", kind: "recovered", mrr: 120.73, previousMrr: 0, origin: "yampa" },
        { email: "b@x", kind: "recovered", mrr: 279.02, previousMrr: 0, origin: "yampa" },
        { email: "c@x", kind: "retained", mrr: 198.65, previousMrr: 0, origin: "yampa" },
      ],
      [{ email: "b@x", mrr: 279.02, origin: "yampa", date: "2026-10-31", tipo: "inadimplente" },
       { email: "c@x", mrr: 198.65, origin: "yampa", date: "2026-10-31", tipo: "inadimplente" }],
      "all",
    );
    expect(r.recuperadosMrr).toBeCloseTo(399.75);
    expect(r.churnMrr).toBeCloseTo(0);
    expect(r.churnCases.find((c) => c.email === "b@x")?.avoidedBy).toBe("Recuperado");
  });
});

describe("retenção no churn previsto", () => {
  it("cliente retido sai do churn previsto e aparece como Retido, mesmo se também recuperado", async () => {
    const { computeProjectedResult } = await import("@/components/goals/projectedResultModel");
    const r = computeProjectedResult(
      [{ email: "a@x.com", mrr: 100, origin: "yampa" }],
      [
        { email: "a@x.com", kind: "retained", mrr: 100, previousMrr: 0, origin: "yampa" },
        { email: "a@x.com", kind: "recovered", mrr: 100, previousMrr: 0, origin: "yampa" },
      ],
      [{ email: "a@x.com", mrr: 100, origin: "yampa", date: "2026-10-31", tipo: "t" }],
      "all", [], 30,
    );
    expect(r.churnQtd).toBe(0);
    expect(r.churnMrr).toBe(0);
    expect(r.churnCases[0].avoidedBy).toBe("Retido");
  });
});

describe("janela de 5 dias úteis para a média de vendas", () => {
  it("pega os 5 dias úteis anteriores, pulando o fim de semana", async () => {
    const { lastBusinessDays } = await import("@/components/goals/projectedResultModel");
    // 30/10/2026 é sexta: quintas...sexta da semana anterior
    expect(lastBusinessDays("2026-10-30")).toEqual([
      "2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26", "2026-10-23",
    ]);
    // 02/11/2026 é segunda: volta ao sábado/domingo e pega a semana anterior
    expect(lastBusinessDays("2026-11-02")).toEqual([
      "2026-10-30", "2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26",
    ]);
  });

  it("divide a produção pela quantidade de dias úteis da janela", async () => {
    const { computeProjectedResult, AVG_BUSINESS_DAYS } = await import("@/components/goals/projectedResultModel");
    const recent = [
      { mrr: 1000, origin: "yampa" as const }, { mrr: 500, origin: "yampa" as const },
      { mrr: 250, origin: "4blue" as const },
    ];
    const r = computeProjectedResult([], [], [], "all", recent, AVG_BUSINESS_DAYS);
    expect(AVG_BUSINESS_DAYS).toBe(5);
    expect(r.mediaVendasMrr).toBe(350); // (1000+500+250) / 5
    expect(r.projectedMrr).toBe(350);
    expect(r.mediaVendasQtd).toBe(0.6); // 3 vendas / 5 dias úteis
    expect(computeProjectedResult([], [], [], "4blue", recent, AVG_BUSINESS_DAYS).mediaVendasMrr).toBe(50);
  });
});
