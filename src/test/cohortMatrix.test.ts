import { describe, expect, it } from "vitest";
import { buildCohortMatrix, buildMonthlyMrrMap, type CohortRow } from "@/lib/campaignCohort";

function row(email: string, activated: string, canceled: string | null, mrr: number): CohortRow {
  return {
    id: email,
    campaign_id: "c",
    email,
    email_norm: email,
    name: null,
    offer: null,
    activated_at: activated,
    result: {
      id: email,
      campaign_id: "c",
      contact_id: email,
      email_norm: email,
      status: canceled ? "canceled" : "active",
      mrr,
      plan_name: null,
      offer_name: null,
      origem_cliente: null,
      started_at: activated,
      canceled_at: canceled,
      churn_type: null,
      source: "metabase",
      churn_source: null,
      snapshot_date: null,
      computed_at: null,
    },
  };
}

describe("buildCohortMatrix com MRR mensal", () => {
  const rows = [
    row("a@x.com", "2026-03-10", null, 599),
    row("b@x.com", "2026-03-10", "2026-04-20", 200),
    // cancelamento anterior à ativação: assinatura antiga, deve ser ignorado
    row("c@x.com", "2026-03-10", "2025-12-22", 100),
  ];

  const monthly = buildMonthlyMrrMap([
    { email_norm: "a@x.com", year_month: "2026-03-01", mrr: 349 },
    { email_norm: "a@x.com", year_month: "2026-04-01", mrr: 599 },
    { email_norm: "b@x.com", year_month: "2026-03-01", mrr: 200 },
  ]);

  it("usa o MRR observado em cada mês", () => {
    const m = buildCohortMatrix(rows, { maxOffset: 1, monthly });
    expect(m).toHaveLength(1);
    const [m0, m1] = m[0].cells;
    // a=349 (snapshot de março) + b=200 + c=100 (sem snapshot, projeta atual)
    expect(m0.mrr).toBe(649);
    expect(m0.active).toBe(3);
    // b some do snapshot de abril; a sobe para 599; c segue projetado
    expect(m1.mrr).toBe(699);
    expect(m1.active).toBe(2);
    expect(m1.estimated).toBe(1);
  });


  it("sem série mensal, projeta o MRR atual e ignora cancelamento pré-ativação", () => {
    const m = buildCohortMatrix(rows, { maxOffset: 1 });
    const [m0, m1] = m[0].cells;
    expect(m0.active).toBe(3);
    expect(m0.mrr).toBe(899);
    expect(m1.active).toBe(2); // b saiu em abril
  });

  it("marca clientes sem snapshot do mês como estimados", () => {
    const m = buildCohortMatrix([row("z@x.com", "2026-03-10", null, 500)], { maxOffset: 0 });
    expect(m[0].cells[0].estimated).toBe(1);
  });
});
