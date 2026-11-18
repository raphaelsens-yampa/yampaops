import { describe, it, expect } from "vitest";
import { matchSales, groupOutcomes, NO_SELLER } from "./sellerChurn";

const sale = (o: any) => ({ customer_email: "a@x.com", assigned_seller_id: "s1", area: "Sales", converted_at: "2026-01-10T10:00:00Z", mrr: 100, conversion_type: "new", ...o });
const name = (id: string | null) => (id === "s1" ? "Ana" : "Bia");

describe("sellerChurn", () => {
  it("conta churn só depois da venda", () => {
    const r = matchSales([sale({})], [{ email: "A@x.com", date: "2026-01-05", mrr: 100, motivo: null, desfecho: "churn" }], name);
    expect(r[0].churned).toBe(false);
    const r2 = matchSales([sale({})], [{ email: "a@x.com", date: "2026-03-01", mrr: 100, motivo: "preço", desfecho: "churn" }], name);
    expect(r2[0].churned).toBe(true);
    expect(r2[0].daysToChurn).toBe(50);
  });
  it("revertido não é churn, conta como recuperado", () => {
    const r = matchSales([sale({})], [{ email: "a@x.com", date: "2026-02-01", mrr: 100, motivo: null, desfecho: "revertido" }], name);
    expect(r[0].churned).toBe(false); expect(r[0].recovered).toBe(true);
  });
  it("exclui conta interna e marca Sem vendedor", () => {
    const r = matchSales([sale({ customer_email: "lau.marcelly@gmail.com" }), sale({ assigned_seller_id: null })], [], name);
    expect(r).toHaveLength(1); expect(r[0].seller).toBe(NO_SELLER);
  });
  it("taxa = churns ÷ vendas e amostra pequena < 10", () => {
    const rows = matchSales([sale({}), sale({ customer_email: "b@x.com" })], [{ email: "a@x.com", date: "2026-02-01", mrr: 100, motivo: null, desfecho: "churn" }], name);
    const g = groupOutcomes(rows, (r) => r.seller)[0];
    expect(g.taxa).toBe(50); expect(g.precoce).toBe(1); expect(g.amostraPequena).toBe(true);
  });
});
