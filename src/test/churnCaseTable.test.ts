import { describe, it, expect } from "vitest";
import {
  DEFAULT_CHURN_SORT, churnDateBR, churnSituation, filterChurnCases, sortChurnCases,
} from "@/components/goals/churnCaseTable";
import type { ChurnCase } from "@/components/goals/projectedResultModel";

const row = (email: string, date: string, mrr: number, extra: Partial<ChurnCase> = {}): ChurnCase => ({
  email, date, mrr, origin: "yampa", tipo: "involuntario", avoided: false, ...extra,
});

const cases: ChurnCase[] = [
  row("carlos@x", "2026-10-30", 399),
  row("ana@x", "2026-10-31", 399),
  row("bruno@x", "2026-10-31", 749),
  row("daniela@x", "2026-10-29", 293),
  row("eduardo@x", "2026-10-31", 120, { avoided: true, avoidedBy: "Recuperado" }),
];

describe("tabela de churn previsto", () => {
  it("abre por padrão com a data mais recente no topo", () => {
    expect(DEFAULT_CHURN_SORT).toEqual({ key: "date", dir: "desc" });
    expect(sortChurnCases(cases, DEFAULT_CHURN_SORT).map((c) => c.email)).toEqual([
      "bruno@x", "ana@x", "eduardo@x", "carlos@x", "daniela@x",
    ]);
  });

  it("no mesmo dia ordena pelo maior MRR", () => {
    const sameDay = sortChurnCases(cases, DEFAULT_CHURN_SORT).filter((c) => c.date === "2026-10-31");
    expect(sameDay.map((c) => c.mrr)).toEqual([749, 399, 120]);
  });

  it("ordena MRR crescente quando o usuario clicou na coluna", () => {
    expect(sortChurnCases(cases, { key: "mrr", dir: "asc" }).map((c) => c.mrr)).toEqual([120, 293, 399, 399, 749]);
  });

  it("filtra por MRR com comparação numérica", () => {
    expect(filterChurnCases(cases, { mrr: ">300" }).map((c) => c.mrr).sort((a, b) => a - b)).toEqual([399, 399, 749]);
  });

  it("filtra data em DD/MM e cliente por trecho do e-mail", () => {
    expect(filterChurnCases(cases, { date: "31/10" }).every((c) => c.date === "2026-10-31")).toBe(true);
    expect(filterChurnCases(cases, { email: "NA@" }).map((c) => c.email)).toEqual(["ana@x"]);
  });

  it("filtra pela situação, separando churn do que foi evitado", () => {
    expect(filterChurnCases(cases, { situacao: "Churn" }).map((c) => c.email)).toEqual([
      "carlos@x", "ana@x", "bruno@x", "daniela@x",
    ]);
    expect(filterChurnCases(cases, { situacao: "Recuperado" }).map((c) => c.email)).toEqual(["eduardo@x"]);
  });

  it("mostra a situação derivada e a data em DD/MM/AAAA", () => {
    expect(churnSituation(cases[0])).toBe("Churn");
    expect(churnSituation(cases[4])).toBe("Recuperado");
    expect(churnDateBR("2026-10-31")).toBe("31/10/2026");
  });
});
