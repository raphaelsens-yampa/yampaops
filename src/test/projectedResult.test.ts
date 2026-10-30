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
});
