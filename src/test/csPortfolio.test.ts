import { describe, expect, it } from "vitest";
import { cadenceStatus, daysOverdue, queuePriority, type CsPortfolioRow } from "@/lib/csPortfolio";

const base: CsPortfolioRow = {
  id: "1", email: "a@b.com", company_name: null, cs_user_id: null, segment_id: null,
  assignment_source: "rule", plano: null, nome_oferta: null, mrr: 100, previous_mrr: null,
  origem_cliente: null, recorrencia_pagamento: null, data_inicio: null, tenure_days: 100,
  industry: null, engagement_score: 50, engagement_band: "medio", churn_risk_score: 50,
  conversations_90d: 0, last_client_message_at: null, last_contact_at: null,
  next_contact_due: null, cadence_days: 30, is_active: true,
};

const TODAY = "2026-09-10";

describe("cadência da carteira de CS", () => {
  it("marca como nunca atendido quando não há contato", () => {
    expect(cadenceStatus(base, TODAY)).toBe("nunca");
    expect(daysOverdue(base, TODAY)).toBe(999);
  });

  it("marca vencido quando a próxima data já passou", () => {
    const r = { ...base, last_contact_at: "2026-08-01", next_contact_due: "2026-08-31" };
    expect(cadenceStatus(r, TODAY)).toBe("vencido");
    expect(daysOverdue(r, TODAY)).toBe(10);
  });

  it("marca vence em breve dentro de 7 dias", () => {
    const r = { ...base, last_contact_at: "2026-09-01", next_contact_due: "2026-09-15" };
    expect(cadenceStatus(r, TODAY)).toBe("em_dia");
    expect(cadenceStatus({ ...r, next_contact_due: "2026-09-14" }, TODAY)).toBe("vence_breve");
  });

  it("prioriza atraso maior, risco maior e MRR maior", () => {
    const late = { ...base, last_contact_at: "2026-01-01", next_contact_due: "2026-02-01" };
    const onTime = { ...base, last_contact_at: "2026-09-01", next_contact_due: "2026-10-01" };
    expect(queuePriority(late, TODAY)).toBeGreaterThan(queuePriority(onTime, TODAY));

    const rich = { ...onTime, mrr: 900 };
    expect(queuePriority(rich, TODAY)).toBeGreaterThan(queuePriority(onTime, TODAY));

    const risky = { ...onTime, churn_risk_score: 95 };
    expect(queuePriority(risky, TODAY)).toBeGreaterThan(queuePriority(onTime, TODAY));
  });
});
