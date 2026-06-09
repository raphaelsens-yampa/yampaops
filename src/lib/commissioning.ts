// Helpers para o módulo Comissionamento

export type PaymentType = "mensal" | "anual_avista" | "anual_mensalizado" | "setup";

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  mensal: "Mensal",
  anual_mensalizado: "Anual (12 parcelas)",
  anual_avista: "Anual à Vista",
  setup: "Setup",
};

export const PAYMENT_TYPES: PaymentType[] = ["mensal", "anual_mensalizado", "anual_avista", "setup"];

export interface CommissionReference {
  id: string;
  plan_name: string;
  payment_type: PaymentType;
  plan_price: number | null;
  plan_mrr: number | null;
  commission_pct: number;
  av_pct: number | null;
  is_active: boolean;
}

export interface PriceMapEntry {
  id: string;
  price_id: string | null;
  offer_name: string | null;
  price_name: string | null;
  plan_name: string | null;
  payment_type: PaymentType | null;
  area: string | null;
  seller_user_id: string | null;
  seller_label: string | null;
  mrr_override: number | null;
}

export interface RawRow {
  company_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  plano_atual?: string | null;
  inicio_vigencia?: Date | null;
  recurrence_days?: number | null;
  offer_name?: string | null;
  price_id?: string | null;
  gateway?: string | null;
  origem_cliente?: string | null;
  mrr?: number | null;
  data_ref?: Date | null;
}

export interface ResolvedRow extends RawRow {
  matched: PriceMapEntry | null;
  reference: CommissionReference | null;
  applied_pct: number;
  commission_amount: number;
  status: "calculated" | "pending_mapping";
}

const norm = (s: string | null | undefined) =>
  (s || "").toString().trim().toLowerCase();

export function resolveRow(
  raw: RawRow,
  priceMap: PriceMapEntry[],
  reference: CommissionReference[],
): ResolvedRow {
  // 1. Match by price_id, then by offer_name
  let matched: PriceMapEntry | null = null;
  if (raw.price_id) {
    matched = priceMap.find((m) => m.price_id === raw.price_id) || null;
  }
  if (!matched && raw.offer_name) {
    const o = norm(raw.offer_name);
    matched = priceMap.find((m) => !m.price_id && norm(m.offer_name) === o) || null;
  }

  if (!matched || !matched.plan_name || !matched.payment_type) {
    return { ...raw, matched, reference: null, applied_pct: 0, commission_amount: 0, status: "pending_mapping" };
  }

  const ref = reference.find(
    (r) => r.plan_name === matched!.plan_name && r.payment_type === matched!.payment_type && r.is_active,
  );
  if (!ref) {
    return { ...raw, matched, reference: null, applied_pct: 0, commission_amount: 0, status: "pending_mapping" };
  }

  const mrr = matched.mrr_override ?? raw.mrr ?? 0;
  const pct = matched.payment_type === "anual_avista" ? (ref.av_pct ?? 0) : ref.commission_pct;
  const amount = mrr * pct;

  return { ...raw, matched, reference: ref, applied_pct: pct, commission_amount: amount, status: "calculated" };
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return r;
}

export function toMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
