/**
 * Report Comercial Semanal — cálculos puros (dias em São Paulo).
 * Vendas: conversões Stripe pagas (mesma regra de openMonthStripeRealized).
 * Churn: metas_churn_daily não revertido, datado por churn_at.
 */
import { openMonthSalesFromStripe, type StripePaidRow } from "./openMonthStripeRealized";
import { stripeConversionOrigin, type OriginFilter } from "./origins";

export interface WeekRange { start: string; end: string }
export interface SaleRow extends StripePaidRow {
  day: string; // YYYY-MM-DD SP
  area: string | null;
  assigned_seller_id: string | null;
  origem_cliente: string | null;
  attribution_source: string | null;
}
export interface ChurnRow { day: string; mrr: number; company: string; origem_cliente: string | null }

const d = (s: string) => new Date(`${s}T12:00:00Z`);
export const addDays = (s: string, n: number) => { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Semana fechada anterior (segunda a domingo) relativa a `today`. */
export function lastClosedWeek(today: string): WeekRange {
  const dow = d(today).getUTCDay(); // 0=dom
  const sinceMonday = (dow + 6) % 7;
  const start = addDays(today, -sinceMonday - 7);
  return { start, end: addDays(start, 6) };
}
export function shiftWeek(w: WeekRange, weeks: number): WeekRange {
  return { start: addDays(w.start, weeks * 7), end: addDays(w.end, weeks * 7) };
}
export function businessDays(start: string, end: string): number {
  let n = 0;
  for (let s = start; s <= end; s = addDays(s, 1)) { const w = d(s).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
export function monthBounds(day: string): WeekRange {
  const start = `${day.slice(0, 7)}-01`;
  const x = d(start); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0);
  return { start, end: x.toISOString().slice(0, 10) };
}

const inRange = (day: string, r: WeekRange) => day >= r.start && day <= r.end;
const originOk = (o: OriginFilter, row: { origem_cliente: string | null; attribution_source?: string | null }) =>
  o === "all" || stripeConversionOrigin(row) === o;

export interface SalesSummary { novos: number; recuperados: number; upsell: number; newMrr: number; qty: number }
export interface CsRecoveryRow { day: string; mrr: number; origin: "yampa" | "4blue"; sellerKey?: string; areaKey?: string }
/** Recuperados = reativações pagas Stripe + recuperações do CS que entram de fato na base. */
export function summarizeSales(rows: SaleRow[], r: WeekRange, origin: OriginFilter = "all", cs: CsRecoveryRow[] = []): SalesSummary {
  const sel = rows.filter((x) => inRange(x.day, r) && originOk(origin, x));
  const s = openMonthSalesFromStripe(sel);
  s.recuperados += cs.filter((x) => inRange(x.day, r) && (origin === "all" || x.origin === origin)).reduce((a, x) => a + x.mrr, 0);
  const qty = sel.filter((x) => String(x.conversion_type || "new").toLowerCase() !== "upsell").length;
  return { novos: s.new_mrr, recuperados: s.recuperados, upsell: s.upsell, newMrr: s.new_mrr + s.recuperados + s.upsell, qty };
}
export interface ChurnSummary { mrr: number; logos: number }
export function summarizeChurn(rows: ChurnRow[], r: WeekRange, origin: OriginFilter = "all"): ChurnSummary {
  const sel = rows.filter((x) => inRange(x.day, r) && (origin === "all" || String(x.origem_cliente || "").toLowerCase() === origin));
  return { mrr: sel.reduce((a, x) => a + (x.mrr || 0), 0), logos: new Set(sel.map((x) => x.company)).size };
}

/** Meta x realizado com pace por dias úteis e tendência linear de fechamento. */
export function pace(goal: number, realized: number, elapsedBd: number, totalBd: number) {
  const expected = totalBd > 0 ? goal * (elapsedBd / totalBd) : 0;
  const trend = elapsedBd > 0 ? (realized / elapsedBd) * totalBd : realized;
  return { goal, realized, pct: goal > 0 ? realized / goal : null, expected, trend };
}

export function rankBy(rows: SaleRow[], keyOf: (r: SaleRow) => string, r: WeekRange, cs: { day: string; mrr: number; key: string }[] = []) {
  const map = new Map<string, { key: string; mrr: number; qty: number }>();
  for (const c of cs) {
    if (!inRange(c.day, r)) continue;
    const cur = map.get(c.key) || { key: c.key, mrr: 0, qty: 0 };
    cur.mrr += c.mrr; map.set(c.key, cur);
  }
  for (const row of rows) {
    if (!inRange(row.day, r)) continue;
    const k = keyOf(row);
    const s = openMonthSalesFromStripe([row]);
    const cur = map.get(k) || { key: k, mrr: 0, qty: 0 };
    cur.mrr += s.new_mrr + s.recuperados + s.upsell;
    if (String(row.conversion_type || "new").toLowerCase() !== "upsell") cur.qty += 1;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.mrr - a.mrr);
}

export function avgSummaries(list: SalesSummary[]): SalesSummary {
  const n = list.length || 1;
  const sum = (k: keyof SalesSummary) => list.reduce((a, x) => a + x[k], 0) / n;
  return { novos: sum("novos"), recuperados: sum("recuperados"), upsell: sum("upsell"), newMrr: sum("newMrr"), qty: sum("qty") };
}
