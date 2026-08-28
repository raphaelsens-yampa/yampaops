import { describe, expect, it } from "vitest";
import { auditAmount, classifyAuditRow } from "@/components/comissionamento/ComissionamentoAudit";

const base = {
  status_assinatura: "ativo",
  origem_cliente: "yampa",
  classificacao_company: "novo pagante",
  data_pagamento: "2026-08-10",
  previous_mrr: null as number | null,
};

describe("auditoria da apuração", () => {
  it("inclui Yampa comissionável com data de pagamento no mês", () => {
    expect(classifyAuditRow(base, "2026-08")).toBe("incluido");
  });

  it("ignora origem 4blue", () => {
    expect(classifyAuditRow({ ...base, origem_cliente: "4blue" }, "2026-08")).toBe("origem_nao_comissionavel");
  });

  it("ignora classificação Regular e Downsell", () => {
    for (const classification of ["regular", "downsell"]) {
      expect(classifyAuditRow({ ...base, classificacao_company: classification }, "2026-08")).toBe(
        "classificacao_nao_comissionavel",
      );
    }
  });

  it("ignora assinatura não ativa, sem data e fora do mês", () => {
    expect(classifyAuditRow({ ...base, status_assinatura: "cancelado" }, "2026-08")).toBe("assinatura_inativa");
    expect(classifyAuditRow({ ...base, data_pagamento: null }, "2026-08")).toBe("sem_data_pagamento");
    expect(classifyAuditRow({ ...base, data_pagamento: "2026-07-31" }, "2026-08")).toBe("data_pagamento_fora_do_mes");
  });

  it("ignora upsell sem MRR anterior", () => {
    expect(classifyAuditRow({ ...base, classificacao_company: "upsell", previous_mrr: null }, "2026-08")).toBe(
      "upsell_sem_previous_mrr",
    );
  });

  it("apura upsell apenas pelo delta positivo", () => {
    expect(auditAmount({ classificacao_company: "upsell", mrr: 500, previous_mrr: 300 })).toBe(200);
    expect(auditAmount({ classificacao_company: "upsell", mrr: 200, previous_mrr: 300 })).toBe(0);
    expect(auditAmount({ classificacao_company: "novo pagante", mrr: 500, previous_mrr: null })).toBe(500);
  });

  it("cada linha cai em exatamente um motivo (totais conferíveis)", () => {
    const rows = [
      base,
      { ...base, origem_cliente: "4blue" },
      { ...base, classificacao_company: "regular" },
      { ...base, data_pagamento: null },
    ];
    const reasons = rows.map((row) => classifyAuditRow(row, "2026-08"));
    expect(reasons).toHaveLength(rows.length);
    expect(reasons.filter((reason) => reason === "incluido")).toHaveLength(1);
  });
});
