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

describe("média de novas vendas (30 dias)", () => {
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
    expect(r.churnMrr).toBeCloseTo(279.02);
  });
});
