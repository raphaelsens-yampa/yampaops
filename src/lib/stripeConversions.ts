export type MrrMode = "net" | "gross";
export interface ConversionValue {
  conversion_type: string;
  mrr: number | null;
  mrr_net: number | null;
  delta_mrr: number | null;
}
export type CampaignFilter = "all" | "campaign" | "non_campaign";
/** Recorte por origem do cliente: todas, só 4blue ou sem 4blue (yampa + sem origem). */
export type OriginCut = "all" | "4blue" | "non_4blue";

export interface ConversionFilters {
  area: string;
  type: string;
  seller: string;
  reactivationOnly: boolean;
  couponOnly: boolean;
  mode: MrrMode;
  campaign: CampaignFilter;
  campaignCtx?: CampaignContext;
  origin: OriginCut;
}

/** Contexto de campanha: cupons marcados como campanha e marcações manuais por e-mail. */
export interface CampaignContext {
  couponIds: Set<string>;
  manualByEmail: Map<string, boolean>;
}

export function normalizeCampaignEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

// Nos gráficos por plano, qualquer plano de Time Financeiro ou BPO conta como
// uma única categoria "Time Financeiro".
export function planChartGroup(plan: string | null | undefined): string {
  const name = String(plan ?? "").trim();
  if (!name) return "Sem plano";
  if (/time financeiro|bpo/i.test(name)) return "Time Financeiro";
  return name;
}

// A conversão é de campanha quando o cliente comprou com cupom marcado como
// campanha. A marcação manual (Divergências de campanha) tem precedência:
// qualquer link manual do e-mail decide, mesmo quando diz "não-campanha".
export function isCampaignConversion(row: { coupon_id: string | null; customer_email: string | null }, ctx: CampaignContext): boolean {
  const manual = ctx.manualByEmail.get(normalizeCampaignEmail(row.customer_email));
  if (manual !== undefined) return manual;
  return Boolean(row.coupon_id?.trim() && ctx.couponIds.has(row.coupon_id.trim()));
}
export interface FilterableConversion extends ConversionValue {
  area: string;
  assigned_seller_id: string | null;
  is_reactivation: boolean | null;
  coupon_id: string | null;
  customer_email: string | null;
  origem_cliente?: string | null;
}
export function subscriptionMrr(row: ConversionValue, mode: MrrMode): number {
  return Number(mode === "net" ? row.mrr_net ?? row.mrr ?? 0 : row.mrr ?? 0);
}
// delta_mrr is the recorded change, including reviewed manual changes. There
// is no previous_mrr_net column, so never fabricate a net/gross conversion.
export function addedMrr(row: ConversionValue, mode: MrrMode): number {
  if (row.conversion_type === "new") return subscriptionMrr(row, mode);
  if (row.conversion_type === "upsell") return Math.max(Number(row.delta_mrr ?? 0), 0);
  return 0;
}
function campaignApplies(row: FilterableConversion, filters: ConversionFilters): boolean {
  if (filters.campaign === "all") return true;
  if (!filters.campaignCtx) return true;
  const isCampaign = isCampaignConversion(row, filters.campaignCtx);
  return filters.campaign === "campaign" ? isCampaign : !isCampaign;
}

// "Recuperação" é opção do filtro de Tipo, não um tipo registrado: é a venda
// nova ou o upsell com sinalizador de reativação. Downgrade e renovação ficam
// fora do painel, então nunca entram nessa fatia.
export function matchesType(row: FilterableConversion, type: string): boolean {
  if (type === "all") return true;
  if (type === "reactivation") return row.is_reactivation === true && (row.conversion_type === "new" || row.conversion_type === "upsell");
  return row.conversion_type === type;
}

// Sem vendedor atribuído, a área assume o lugar do vendedor na apresentação.
export function sellerLabelOf(row: { assigned_seller_id: string | null; area: string }, sellersMap: Record<string, string>): string {
  return row.assigned_seller_id ? sellersMap[row.assigned_seller_id] || row.assigned_seller_id.slice(0, 8) : row.area;
}

export function matchesConversion(row: FilterableConversion, filters: ConversionFilters): boolean {
  return subscriptionMrr(row, filters.mode) > 0
    && (filters.area === "all" || row.area === filters.area)
    && matchesType(row, filters.type)
    && (filters.seller === "all" || (filters.seller === "none" ? !row.assigned_seller_id : row.assigned_seller_id === filters.seller))
    && (!filters.reactivationOnly || row.is_reactivation === true)
    && (!filters.couponOnly || Boolean(row.coupon_id?.trim()))
    && campaignApplies(row, filters);
}
const SP_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function dayKeySP(date: Date): string {
  const parts = SP_DAY.formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function validDateRange(range: { start: string; end: string }): boolean {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
  return valid(range.start) && valid(range.end) && range.start <= range.end;
}
export function spRange(range: { start: string; end: string }) {
  return { from: `${range.start}T00:00:00-03:00`, to: `${range.end}T23:59:59.999-03:00`, until: `${shiftDay(range.end, 1)}T00:00:00-03:00` };
}
export function conversionPreset(key: string, now = new Date()): { start: string; end: string } {
  const today = dayKeySP(now);
  if (key === "this_month") {
    const first = `${today.slice(0, 7)}-01`;
    const date = new Date(`${first}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return { start: first, end: shiftDay(date.toISOString().slice(0, 10), -1) };
  }
  if (key === "ytd") return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return { start: shiftDay(today, key === "last_90" ? -89 : -29), end: today };
}