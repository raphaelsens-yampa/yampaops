import { describe, expect, it } from "vitest";
import { applyPortfolioFilters, EMPTY_FILTERS } from "@/components/cs-portfolio/PortfolioFilters";

const row = (id: string, email: string) => ({ id, email, company_name: null } as any);
const rows = [row("1", "a@x.com"), row("2", "b@x.com")];
const tags: Record<string, string[]> = { "a@x.com": ["t1"] };
const tagsOf = (r: any) => tags[r.email] || [];

describe("filtro por tag da carteira de CS", () => {
  it("mostra só clientes com a tag escolhida", () => {
    expect(applyPortfolioFilters(rows, { ...EMPTY_FILTERS, tagId: "t1" }, () => "", tagsOf).map((r) => r.id)).toEqual(["1"]);
  });
  it("'Sem tag' mostra só clientes sem tags", () => {
    expect(applyPortfolioFilters(rows, { ...EMPTY_FILTERS, tagId: "none" }, () => "", tagsOf).map((r) => r.id)).toEqual(["2"]);
  });
});
