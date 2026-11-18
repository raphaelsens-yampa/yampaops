/** Churn por vendedor/área: cruza vendas pagas com churns posteriores do mesmo e-mail. */
export interface SaleRow {
  customer_email: string | null;
  assigned_seller_id: string | null;
  area: string | null;
  converted_at: string;
  mrr: number;
  conversion_type: string;
  origem?: string | null;
}
export interface ChurnEvent { email: string | null; date: string; mrr: number; motivo: string | null; desfecho: string; }

export const INTERNAL_EMAILS = new Set(["lau.marcelly@gmail.com"]);
export const NO_SELLER = "Sem vendedor";

export interface SaleOutcome extends SaleRow {
  email: string; seller: string; areaLabel: string;
  churned: boolean; churnDate: string | null; churnMrr: number; motivo: string | null; daysToChurn: number | null; recovered: boolean;
}

const norm = (e: string | null) => (e || "").trim().toLowerCase();
const day = (s: string) => s.slice(0, 10);

/** Para cada venda, primeiro churn efetivo do e-mail depois da data da venda; revertidos contam como recuperados. */
export function matchSales(sales: SaleRow[], churns: ChurnEvent[], sellerName: (id: string | null) => string): SaleOutcome[] {
  const byEmail = new Map<string, ChurnEvent[]>();
  for (const c of churns) {
    const em = norm(c.email); if (!em) continue;
    (byEmail.get(em) || byEmail.set(em, []).get(em)!).push(c);
  }
  for (const l of byEmail.values()) l.sort((a, b) => a.date.localeCompare(b.date));
  const out: SaleOutcome[] = [];
  for (const s of sales) {
    const email = norm(s.customer_email);
    if (!email || INTERNAL_EMAILS.has(email)) continue;
    const after = (byEmail.get(email) || []).filter((c) => day(c.date) > day(s.converted_at));
    const churn = after.find((c) => c.desfecho === "churn") || null;
    const recovered = !churn && after.some((c) => c.desfecho === "revertido");
    const dtc = churn ? Math.round((new Date(day(churn.date)).getTime() - new Date(day(s.converted_at)).getTime()) / 86400000) : null;
    out.push({
      ...s, email,
      seller: s.assigned_seller_id ? sellerName(s.assigned_seller_id) : NO_SELLER,
      areaLabel: s.area && s.area !== "desconhecida" ? s.area : "Não identificado",
      churned: !!churn, churnDate: churn ? day(churn.date) : null, churnMrr: churn ? Number(churn.mrr || s.mrr || 0) : 0,
      motivo: churn?.motivo ?? null, daysToChurn: dtc, recovered,
    });
  }
  return out;
}

export interface ChurnGroup {
  key: string; vendas: number; mrrVendido: number; churns: number; taxa: number;
  mrrPerdido: number; pctMrrPerdido: number; diasMedio: number | null; precoce: number; recuperados: number; amostraPequena: boolean;
}

export function groupOutcomes(rows: SaleOutcome[], keyOf: (r: SaleOutcome) => string): ChurnGroup[] {
  const m = new Map<string, ChurnGroup & { _d: number[] }>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) || { key: k, vendas: 0, mrrVendido: 0, churns: 0, taxa: 0, mrrPerdido: 0, pctMrrPerdido: 0, diasMedio: null, precoce: 0, recuperados: 0, amostraPequena: false, _d: [] };
    g.vendas++; g.mrrVendido += Number(r.mrr || 0);
    if (r.churned) { g.churns++; g.mrrPerdido += r.churnMrr; if (r.daysToChurn != null) { g._d.push(r.daysToChurn); if (r.daysToChurn <= 90) g.precoce++; } }
    if (r.recovered) g.recuperados++;
    m.set(k, g);
  }
  return [...m.values()].map(({ _d, ...g }) => ({
    ...g,
    taxa: g.vendas ? (g.churns / g.vendas) * 100 : 0,
    pctMrrPerdido: g.mrrVendido ? (g.mrrPerdido / g.mrrVendido) * 100 : 0,
    diasMedio: _d.length ? Math.round(_d.reduce((a, b) => a + b, 0) / _d.length) : null,
    amostraPequena: g.vendas < 10,
  })).sort((a, b) => b.taxa - a.taxa || b.churns - a.churns);
}

/** Safra: churn acumulado de cada mês de venda. */
export function cohortByMonth(rows: SaleOutcome[]) {
  return groupOutcomes(rows, (r) => r.converted_at.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
}
