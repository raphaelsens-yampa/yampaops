export type CategoryArea = "sales" | "cs" | "campaign" | "financial";
export type MetricType = "mrr" | "count" | "ratio" | "currency";
export type AutoSource =
  | "manual"
  | "stripe"
  | "stripe_ltv"
  | "stripe_cac"
  | "stripe_ltv_cac"
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
  ratio: "Razão",
  currency: "Valor (R$)",
};

export const AUTO_SOURCE_LABELS: Record<AutoSource, string> = {
  manual: "Manual (opps ganhas ou override)",
  stripe: "Stripe — soma MRR líquido da área",
  stripe_ltv: "Stripe — LTV (MRR médio ÷ churn)",
  stripe_cac: "Stripe — CAC (custo ÷ conversões Marketing)",
  stripe_ltv_cac: "Stripe — LTV/CAC",
  deals_count: "Contagem de opps ganhas na categoria",
};

export const STRIPE_AREA_PRESETS = ["Sales", "Marketing", "CS", "Outros"];

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
    return value.toFixed(2) + "x";
  }
  return value.toLocaleString("pt-BR");
}
