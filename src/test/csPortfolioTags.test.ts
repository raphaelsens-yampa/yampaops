import { describe, expect, it } from "vitest";
import { applyPortfolioFilters, EMPTY_FILTERS } from "@/components/cs-portfolio/PortfolioFilters";

const row = (id: string, email: string) => ({ id, email, company_name: null } as any);
const rows = [row("1", "a@x.com"), row("2", "b@x.com"), row("3", "c@x.com")];
const tags: Record<string, string[]> = { "a@x.com": ["t1"], "c@x.com": ["t2"] };
const tagsOf = (r: any) => tags[r.email] || [];

describe("filtro por tag da carteira de CS", () => {
  it("mostra só clientes com a tag escolhida", () => {
    expect(applyPortfolioFilters(rows, { ...EMPTY_FILTERS, tagMode: "pick", tagIds: ["t1"] }, () => "", tagsOf).map((r) => r.id)).toEqual(["1"]);
  });
  it("'Sem tag' mostra só clientes sem tags", () => {
    expect(applyPortfolioFilters(rows, { ...EMPTY_FILTERS, tagMode: "none" }, () => "", tagsOf).map((r) => r.id)).toEqual(["2"]);
  });
  it("'Com pelo menos 1 tag' mostra clientes com qualquer tag", () => {
    expect(applyPortfolioFilters(rows, { ...EMPTY_FILTERS, tagMode: "any" }, () => "", tagsOf).map((r) => r.id)).toEqual(["1", "3"]);
  });
  it("várias tags mostram clientes com qualquer uma delas", () => {
    expect(applyPortfolioFilters(rows, { ...EMPTY_FILTERS, tagMode: "pick", tagIds: ["t1", "t2"] }, () => "", tagsOf).map((r) => r.id)).toEqual(["1", "3"]);
  });
});
