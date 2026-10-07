/**
 * Planejamento de Campanhas — previsão a partir do Histórico de Campanhas.
 *
 * Cada campanha passada vira um conjunto de razões de eficiência
 * (vendas por R$ investido, ticket MRR, LTV/CAC). A previsão aplica essas
 * razões a um investimento (direto) ou resolve o investimento para uma meta
 * (reverso). Cenários: Esperado = média; Otimista = quartil superior;
 * Pessimista = quartil inferior.
 */

export interface CampaignActuals {
  id: string;
  name: string;
  type: string;
  channel: string | null;
  ref_month: string | null;
  investment: number; // investimento líquido (fallback investimento)
  sales: number;
  mrr: number;
  ltvCac: number | null;
  leads: number | null;
}

export interface Ratios {
  salesPerReal: number;
  ticket: number;
  ltvCac: number;
}

export type ScenarioKey = "pessimista" | "esperado" | "otimista";
export const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  pessimista: "Pessimista",
  esperado: "Esperado",
  otimista: "Otimista",
};

/** Tipo da campanha = nome sem datas, números e parênteses ("Workshop FC (Aleks)" → "Workshop FC"). */
export function campaignType(name: string): string {
  return (
    String(name || "")
      .replace(/\(.*?\)/g, "")
      .replace(/\d{1,2}\/\d{2,4}/g, "")
      .replace(/\b\d{4}\b/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Outras"
  );
}

export function quantile(values: number[], q: number): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  if (v.length === 1) return v[0];
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/** Só campanhas com investimento, vendas e MRR positivos entram na base. */
export function usableCampaigns(list: CampaignActuals[]): CampaignActuals[] {
  return list.filter((c) => c.investment > 0 && c.sales > 0 && c.mrr > 0);
}

export function buildRatios(list: CampaignActuals[]): Record<ScenarioKey, Ratios> | null {
  const base = usableCampaigns(list);
  if (!base.length) return null;
  const spr = base.map((c) => c.sales / c.investment);
  const ticket = base.map((c) => c.mrr / c.sales);
  const ltv = base.map((c) => c.ltvCac).filter((x): x is number => x != null && x > 0);
  return {
    esperado: { salesPerReal: mean(spr), ticket: mean(ticket), ltvCac: mean(ltv) },
    otimista: { salesPerReal: quantile(spr, 0.75), ticket: quantile(ticket, 0.75), ltvCac: quantile(ltv, 0.75) },
    pessimista: { salesPerReal: quantile(spr, 0.25), ticket: quantile(ticket, 0.25), ltvCac: quantile(ltv, 0.25) },
  };
}

export interface Forecast {
  investment: number;
  sales: number;
  mrr: number;
  cac: number;
  ltvPerSale: number;
  ltvTotal: number;
  ltvCac: number;
  roiPct: number;
  growthPct: number | null;
  paybackMonths: number | null;
}

export function forecastFromInvestment(r: Ratios, investment: number, baseMrr: number | null): Forecast {
  const sales = investment * r.salesPerReal;
  const mrr = sales * r.ticket;
  const cac = r.salesPerReal > 0 ? 1 / r.salesPerReal : 0;
  const ltvPerSale = r.ltvCac * cac;
  const ltvTotal = ltvPerSale * sales;
  return {
    investment,
    sales,
    mrr,
    cac,
    ltvPerSale,
    ltvTotal,
    ltvCac: r.ltvCac,
    roiPct: investment > 0 ? ((ltvTotal - investment) / investment) * 100 : 0,
    growthPct: baseMrr && baseMrr > 0 ? (mrr / baseMrr) * 100 : null,
    paybackMonths: mrr > 0 ? investment / mrr : null,
  };
}

export type GoalType = "mrr" | "growth" | "ltv_cac" | "roi";
export const GOAL_LABEL: Record<GoalType, string> = {
  mrr: "MRR a gerar (R$)",
  growth: "Crescimento a.m. (%)",
  ltv_cac: "LTV/CAC alvo (x)",
  roi: "ROI alvo (%)",
};

export interface ReverseResult {
  /** Investimento necessário (metas de MRR/crescimento). */
  investment: number | null;
  /** CAC máximo permitido (metas de LTV/CAC e ROI). */
  maxCac: number | null;
  /** O cenário atinge a meta de eficiência? */
  meets: boolean | null;
  forecast: Forecast | null;
}

export function reverseForGoal(
  r: Ratios,
  goal: GoalType,
  value: number,
  baseMrr: number | null,
  referenceInvestment: number,
): ReverseResult {
  if (!(value > 0) || r.salesPerReal <= 0 || r.ticket <= 0) return { investment: null, maxCac: null, meets: null, forecast: null };
  const mrrPerReal = r.salesPerReal * r.ticket;
  if (goal === "mrr" || goal === "growth") {
    const targetMrr = goal === "mrr" ? value : baseMrr ? (baseMrr * value) / 100 : 0;
    if (!targetMrr) return { investment: null, maxCac: null, meets: null, forecast: null };
    const investment = targetMrr / mrrPerReal;
    return { investment, maxCac: null, meets: null, forecast: forecastFromInvestment(r, investment, baseMrr) };
  }
  const f = forecastFromInvestment(r, referenceInvestment, baseMrr);
  // LTV por venda é propriedade do cenário; a meta define até quanto pode custar cada venda.
  const targetRatio = goal === "ltv_cac" ? value : 1 + value / 100;
  const maxCac = f.ltvPerSale / targetRatio;
  return { investment: null, maxCac, meets: f.cac <= maxCac, forecast: f };
}
