import { describe, expect, it } from "vitest";
import { findViolations, VOLATILE_TABLES } from "../../scripts/pagedQueryGuard.mjs";
import { splitByBaseline } from "../../scripts/pagedQueryBaseline.mjs";
import baseline from "../../scripts/paged-query-baseline.json";
import { SUPABASE_PAGE_SIZE, fetchAllPaged } from "@/lib/supabasePaged";

/** Simula o corte silencioso da Data API em 1.000 linhas por requisição. */
function fakeTable(totalRows: number) {
  const rows = Array.from({ length: totalRows }, (_, index) => ({ id: index + 1 }));
  let requests = 0;
  return {
    get requests() {
      return requests;
    },
    build: () => ({
      range: async (from: number, to: number) => {
        requests++;
        const size = Math.min(to - from + 1, SUPABASE_PAGE_SIZE);
        return { data: rows.slice(from, from + size), error: null };
      },
    }),
  };
}

describe("guardrail de paginação", () => {
  it("não permite novas queries sem fetchAllPaged em tabelas de volume variável", () => {
    const { blocking } = splitByBaseline(findViolations("src"), baseline.allow);
    expect(blocking.map((v: { file: string; line: number; table: string }) => `${v.file}:${v.line} (${v.table})`)).toEqual([]);
  });

  it("cobre as tabelas críticas de apuração", () => {
    for (const table of ["commission_conversions", "stripe_conversions", "metas_ativos_pagantes_daily", "metas_ativos_pagantes_monthly"]) {
      expect(VOLATILE_TABLES).toContain(table);
    }
  });

  it("a tela de Conversões por Área usa fetchAllPaged em stripe_conversions", () => {
    const { blocking } = splitByBaseline(findViolations("src/pages/StripeConversions.tsx".replace(/\/[^/]+$/, "")), baseline.allow);
    expect(blocking.filter((v: { file: string }) => v.file.endsWith("StripeConversions.tsx"))).toEqual([]);
  });
});

describe("fetchAllPaged", () => {
  it("carrega 1.161 de 1.161 linhas em 2 requisições (sem truncar em 1.000)", async () => {
    const table = fakeTable(1161);
    const { data, error } = await fetchAllPaged<{ id: number }>(table.build);
    expect(error).toBeNull();
    expect(data).toHaveLength(1161);
    expect(table.requests).toBe(2);
    expect(data[0].id).toBe(1);
    expect(data[data.length - 1].id).toBe(1161);
    expect(new Set(data.map((row) => row.id)).size).toBe(1161);
  });

  it("faz uma requisição extra quando o total é múltiplo exato da página", async () => {
    const table = fakeTable(2000);
    const { data } = await fetchAllPaged<{ id: number }>(table.build);
    expect(data).toHaveLength(2000);
    expect(table.requests).toBe(3);
  });

  it("carrega tudo em bases grandes", async () => {
    const table = fakeTable(12387);
    const { data } = await fetchAllPaged<{ id: number }>(table.build);
    expect(data).toHaveLength(12387);
  });

  it("propaga erro e devolve o que já foi lido", async () => {
    const { data, error } = await fetchAllPaged<{ id: number }>(() => ({
      range: async () => ({ data: null, error: { message: "falha" } }),
    }));
    expect(error).toBe("falha");
    expect(data).toEqual([]);
  });
});
