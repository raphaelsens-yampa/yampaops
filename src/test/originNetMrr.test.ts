import { describe, expect, it } from "vitest";
import { buildOriginMonthly, type OriginRpcRow } from "@/lib/origins";

const stock = (month: string, origem: string, mrr: number): OriginRpcRow => ({
  year_month: `${month}-01`, kind: "stock", origem, status: "ativo",
  classificacao: "regular", qtd: 100, mrr,
});

describe("NET MRR mensal por origem", () => {
  it("crescimento Yampa de outubro reconcilia com o Total de MRR, mesmo com fluxos negativos", () => {
    const result = buildOriginMonthly([
      stock("2026-09", "yampa", 300056.79),
      stock("2026-10", "yampa", 301010.25),
      { year_month: "2026-10-01", kind: "stock", origem: "yampa", status: "cancelado", classificacao: null, mrr: 22000, qtd: 100 },
    ], "yampa");
    expect(result.get("2026-10|net_mrr")?.mrr).toBeCloseTo(953.46, 2);
  });

  it("mantém a queda real de 4blue negativa e isolada da Yampa", () => {
    const result = buildOriginMonthly([
      stock("2026-09", "4blue", 33800), stock("2026-10", "4blue", 31980),
      stock("2026-09", "yampa", 300056.79), stock("2026-10", "yampa", 301010.25),
    ], "4blue");
    expect(result.get("2026-10|net_mrr")?.mrr).toBe(-1820);
  });

  it("não inventa NET sem foto do mês imediatamente anterior", () => {
    const result = buildOriginMonthly([
      stock("2026-01", "yampa", 100), stock("2026-03", "yampa", 200),
    ], "yampa");
    expect(result.has("2026-01|net_mrr")).toBe(false);
    expect(result.has("2026-03|net_mrr")).toBe(false);
  });

  it("preserva NET zero quando a base não varia", () => {
    const result = buildOriginMonthly([
      stock("2026-09", "yampa", 100), stock("2026-10", "yampa", 100),
    ], "yampa");
    expect(result.get("2026-10|net_mrr")?.mrr).toBe(0);
  });

  it("usa dezembro como fechamento anterior a janeiro", () => {
    const result = buildOriginMonthly([
      stock("2025-12", "yampa", 100), stock("2026-01", "yampa", 150),
    ], "yampa");
    expect(result.get("2026-01|net_mrr")?.mrr).toBe(50);
  });
});