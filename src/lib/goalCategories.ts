export type CategoryArea = "sales" | "cs" | "campaign" | "financial";
export type MetricType = "mrr" | "count" | "ratio" | "currency";

export interface GoalCategory {
  id: string;
  name: string;
  slug: string;
  area: CategoryArea;
  metric_type: MetricType;
  is_system: boolean;
  is_active: boolean;
  description?: string | null;
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

export const FINANCIAL_SLUGS = {
  LTV: "ltv",
  CAC: "cac",
  LTV_CAC: "ltv_cac",
  CAMPANHA_MRR: "campanha_mrr",
};

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
