export type CategoryArea = "sales" | "cs" | "campaign" | "financial";
export type MetricType = "mrr" | "count" | "ratio" | "currency";
export type GoalDirection = "gte" | "lte";
export type AutoSource =
  | "manual"
  | "stripe"
  | "stripe_net_mrr"
  | "stripe_ltv"
  | "stripe_cac"
  | "stripe_ltv_cac"
  | "stripe_churn_mrr"
  | "stripe_churn_logos"
  | "stripe_churn_rate_logos"
  | "deals_count";

export interface GoalCategory {
  id: string;
  name: string;
  slug: string;
  area: CategoryArea;
  metric_type: MetricType;
  is_system: boolean;
  is_active: boolean;
  description?: string | null;
  stripe_area?: string | null;
  auto_source?: AutoSource | string | null;
  goal_direction?: GoalDirection | string | null;
}

export const AREA_LABELS: Record<CategoryArea, string> = {
  sales: "Sales",
  cs: "Customer Success",
  campaign: "Campanhas",
  financial: "Financeiro",
};

export const METRIC_TYPE_LABELS: Record<MetricType, string> = {
  mrr: "MRR (R$)",
  count: "Quantidade",
  ratio: "Razão / %",
  currency: "Valor (R$)",
};

export const AUTO_SOURCE_LABELS: Record<AutoSource, string> = {
  manual: "Manual (opps ganhas ou override)",
  stripe: "Stripe — soma MRR líquido da área",
  stripe_net_mrr: "Stripe — Net MRR (Novo + Expansão − Downgrade − Churn)",
  stripe_ltv: "Stripe — LTV (MRR médio ÷ churn)",
  stripe_cac: "Stripe — CAC (custo ÷ conversões Marketing)",
  stripe_ltv_cac: "Stripe — LTV/CAC",
  stripe_churn_mrr: "Stripe — Churn de MRR (R$ perdido)",
  stripe_churn_logos: "Stripe — Churn de logos (contagem)",
  stripe_churn_rate_logos: "Stripe — Churn % (logos ÷ base inicial)",
  deals_count: "Contagem de opps ganhas na categoria",
};

export const GOAL_DIRECTION_LABELS: Record<GoalDirection, string> = {
  gte: "Alvo mínimo (maior é melhor)",
  lte: "Teto (menor é melhor)",
};

export const STRIPE_AREA_PRESETS = ["Sales", "Marketing", "CS", "Produto", "Outros"];

export function isBetterBelow(direction?: string | null): boolean {
  return direction === "lte";
}

/** Progresso comparável — quando lte, inverte para "quanto abaixo do teto". */
export function progressPct(realized: number, target: number, direction?: string | null): number {
  if (!target || target <= 0) return 0;
  if (isBetterBelow(direction)) {
    if (realized <= 0) return 100;
    return Math.min(100, (target / realized) * 100);
  }
  return (realized / target) * 100;
}

/** Cor de status considerando direção. */
export function statusColorFor(realized: number, target: number, direction?: string | null): string {
  if (!target || target <= 0) return "bg-muted";
  if (isBetterBelow(direction)) {
    const ratio = realized / target;
    if (ratio <= 1) return "bg-emerald-500";
    if (ratio <= 1.2) return "bg-amber-500";
    return "bg-rose-500";
  }
  const pct = (realized / target) * 100;
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

export function groupByArea(categories: GoalCategory[]): Record<CategoryArea, GoalCategory[]> {
  return categories.reduce((acc, c) => {
    if (!acc[c.area]) acc[c.area] = [];
    acc[c.area].push(c);
    return acc;
  }, { sales: [], cs: [], campaign: [], financial: [] } as Record<CategoryArea, GoalCategory[]>);
}

export function formatMetric(value: number, type: MetricType): string {
  if (type === "mrr" || type === "currency") {
    return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  }
  if (type === "ratio") {
    return `${value.toFixed(2)}%`;
  }
  return value.toLocaleString("pt-BR");
}
