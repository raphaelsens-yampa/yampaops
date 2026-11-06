import { describe, it, expect } from "vitest";
import { projectTrack, rampPlan, eligibleClients, type BaseClient, type ExpansionTrack } from "@/lib/baseExpansion";

const base: BaseClient[] = [
  { email: "a", company_name: null, plano: "CONTROL", mrr: 100, tenure_days: 90, origem_cliente: "yampa" },
  { email: "b", company_name: null, plano: "CONTROL", mrr: 100, tenure_days: 10, origem_cliente: "yampa" },
  { email: "c", company_name: null, plano: "PROFIT", mrr: 200, tenure_days: 90, origem_cliente: "yampa" },
];
const catalog = [{ nome: "BPO", preco_mensal: 600, custo: 1200, meses: 12 }];
const bpo: ExpansionTrack = {
  key: "bpo", label: "BPO", kind: "cross_sell", eligiblePlans: ["profit", "control"], minTenureDays: 60,
  serviceName: "BPO", adoptionPct: { pessimista: 25, realista: 50, otimista: 100 },
};

describe("baseExpansion", () => {
  it("elegíveis respeitam plano e tempo de casa mínimo", () => {
    expect(eligibleClients(base, bpo).map((c) => c.email)).toEqual(["a", "c"]);
  });
  it("contratos arredondam meio para cima e MRR = contratos × preço do serviço", () => {
    const p = projectTrack(base, bpo, catalog);
    expect(p.byScenario.pessimista.contratos).toBe(1); // 0,5 → 1
    expect(p.byScenario.otimista.mrr).toBe(1200);
    expect(p.byScenario.otimista.margemMensal).toBe(2 * (600 - 100));
  });
  it("upsell usa diferença entre ticket do plano destino e MRR atual", () => {
    const up: ExpansionTrack = { ...bpo, kind: "upsell", eligiblePlans: ["CONTROL"], targetPlan: "PROFIT", adoptionPct: { pessimista: 0, realista: 0, otimista: 100 } };
    expect(projectTrack(base, up, catalog).byScenario.otimista.mrr).toBe(100);
  });
  it("rampa distribui contratos inteiros somando o total", () => {
    const r = rampPlan(10, 50, 3);
    expect(r.map((m) => m.contratos)).toEqual([3, 4, 3]);
    expect(r[2].mrrAcumulado).toBe(500);
  });
});

import { excludeInternal } from "@/lib/baseExpansion";
describe("contas internas", () => {
  it("lau.marcelly@gmail.com (MRR virtual) fica fora da análise", () => {
    const rows = excludeInternal([{ email: "lau.marcelly@gmail.com", company_name: null, plano: "PROFIT", mrr: 999, tenure_days: 100, origem_cliente: "yampa" }]);
    expect(rows).toHaveLength(0);
  });
});
