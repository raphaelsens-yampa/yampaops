export type MarkupLineKey = "premium" | "gold" | "prata";

export const LINE_LABEL: Record<MarkupLineKey, string> = {
  premium: "Linha Premium",
  gold: "Linha Gold",
  prata: "Linha Prata",
};

export interface Capacity {
  people: number;
  hours_per_day: number;
  work_days: number;
  productivity_pct: number;
}

export interface CostItem {
  description: string;
  amount: number;
}

export interface MarkupLine {
  tax_pct: number;
  commission_pct: number;
  gateway_pct: number;
  investment_pct: number;
  sales_commission_pct: number;
  fixed_expense_pct: number;
  churn_pct: number;
  profit_pct: number;
}

export interface InputItem {
  id: string;
  name: string;
  minutes: number;
  unit: string;
}

export interface RecipeRef {
  kind: "input" | "subproduct";
  ref: string;
  qty: number;
}

export interface Subproduct {
  id: string;
  name: string;
  items: RecipeRef[];
  cached_cost?: number;
}

export interface Service {
  id: string;
  name: string;
  contract_months: number;
  line: MarkupLineKey;
  practiced_price: number; // total do contrato
  qty_sold: number;
  recipe: RecipeRef[];
  active: boolean;
}

export interface PricingSnapshot {
  version: number;
  currency: string;
  capacity: Capacity;
  fixed_costs: CostItem[];
  labor_costs: CostItem[];
  markup_lines: Record<MarkupLineKey, MarkupLine>;
  inputs: InputItem[];
  subproducts: Subproduct[];
  services: Service[];
}

export interface PricingVersionRow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  is_active: boolean;
  source: "manual" | "import" | "seed" | "duplicate";
  snapshot: PricingSnapshot;
  created_at: string;
  updated_at: string;
}
