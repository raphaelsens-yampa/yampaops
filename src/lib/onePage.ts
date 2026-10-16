// Regras puras do OnePage Diretoria. Tudo vem das Metas Estratégicas
// (metabase_monthly_agg + goals da empresa), sem dados externos.

/** Métricas em quantidade (lê deals_count); as demais são valores em R$ ou %. */
export const COUNT_METRICS = new Set(["ativos_pagantes", "churn_qtd", "stripe_ativos_yampa20"]);
/** Métricas em que menos é melhor. */
export const LOWER_IS_BETTER = new Set(["churn_mrr", "churn_qtd", "churn_pct", "downsell_mrr"]);

export interface AggRow { metric_key: string; year_month: string; category_id: string | null; realized_amount: number | null; deals_count: number | null }
export interface GoalRow { category_id: string | null; period_start: string; target_mrr: number | null; target_deals: number | null }

export function realizedOf(row: AggRow | undefined): number | null {
  if (!row) return null;
  return Number((COUNT_METRICS.has(row.metric_key) ? row.deals_count : row.realized_amount) ?? 0);
}

/** Meta da categoria no mês: valor em R$ quando houver, senão quantidade; 0 = sem meta. */
export function targetOf(goal: GoalRow | undefined): number | null {
  if (!goal) return null;
  const mrr = Number(goal.target_mrr ?? 0);
  if (mrr !== 0) return mrr;
  const deals = Number(goal.target_deals ?? 0);
  return deals !== 0 ? deals : null;
}

/** % de atingimento = realizado ÷ meta. Em métricas de perda, acima de 100% = perda acima do orçado. */
export function attainment(realized: number | null, target: number | null): number | null {
  if (realized == null || target == null || target === 0) return null;
  return (realized / target) * 100;
}

/** Bom ou ruim, considerando a direção da métrica. */
export function attainmentTone(metric: string, pct: number | null): "up" | "down" | "flat" {
  if (pct == null) return "flat";
  const good = LOWER_IS_BETTER.has(metric) ? pct <= 100 : pct >= 100;
  return good ? "up" : "down";
}

export function arpa(totalMrr: number | null, ativos: number | null): number | null {
  if (!totalMrr || !ativos) return null;
  return totalMrr / ativos;
}
