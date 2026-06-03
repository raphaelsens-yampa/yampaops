import type {
  PricingSnapshot,
  MarkupLineKey,
  MarkupLine,
  Service,
  RecipeRef,
  Subproduct,
} from "./types";

export function sumCosts(items: { amount: number }[]): number {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function totalFixedCost(snap: PricingSnapshot): number {
  return sumCosts(snap.fixed_costs) + sumCosts(snap.labor_costs);
}

/** Custo por minuto produtivo */
export function costPerMinute(snap: PricingSnapshot): number {
  const c = snap.capacity;
  const totalMinutes = c.people * c.hours_per_day * 60 * c.work_days * c.productivity_pct;
  if (!totalMinutes) return 0;
  // 12 = mensal (custo fixo mensal) ÷ minutos do ano? Na planilha original o cálculo é anual
  // Mas como a despesa é mensal, multiplicamos por 12 para anual
  const annualFixed = totalFixedCost(snap) * 12;
  return annualFixed / totalMinutes;
}

/** Soma de % variáveis (todos exceto profit) */
export function variableSum(l: MarkupLine): number {
  return (
    l.tax_pct +
    l.commission_pct +
    l.gateway_pct +
    l.investment_pct +
    l.sales_commission_pct +
    l.fixed_expense_pct +
    l.churn_pct
  );
}

/** Taxa de marcação = 1 / (1 - var - lucro) */
export function markupRate(l: MarkupLine): number {
  const denom = 1 - variableSum(l) - l.profit_pct;
  if (denom <= 0) return 0;
  return 1 / denom;
}

/** Custo de um insumo individual (em R$) */
export function inputCost(snap: PricingSnapshot, inputId: string): number {
  const i = snap.inputs.find((x) => x.id === inputId);
  if (!i) return 0;
  return i.minutes * costPerMinute(snap);
}

/** Custo de um subproduto (recipe ou cached) */
export function subproductCost(snap: PricingSnapshot, sub: Subproduct): number {
  if (sub.items && sub.items.length > 0) {
    return sub.items.reduce((s, it) => s + recipeRefCost(snap, it), 0);
  }
  return sub.cached_cost ?? 0;
}

export function recipeRefCost(snap: PricingSnapshot, ref: RecipeRef): number {
  const qty = Number(ref.qty) || 0;
  if (ref.kind === "input") return qty * inputCost(snap, ref.ref);
  const sub = snap.subproducts.find((s) => s.id === ref.ref);
  if (!sub) return 0;
  return qty * subproductCost(snap, sub);
}

/** Custo total da ficha técnica de um serviço (do contrato inteiro) */
export function serviceCost(snap: PricingSnapshot, svc: Service): number {
  return svc.recipe.reduce((s, r) => s + recipeRefCost(snap, r), 0);
}

export interface ServiceCalc {
  cost_total: number;
  cost_monthly: number;
  practiced_total: number;
  practiced_monthly: number;
  markup: number;
  ideal_price_total: number; // preço sugerido total contrato
  ideal_price_monthly: number;
  margin_value: number; // MC: (preço - CV) / contrato
  margin_pct: number; // MC%
  delta_vs_ideal_pct: number; // (praticado - ideal) / ideal
  status: "preco_bom" | "abaixo_ideal" | "acima_ideal" | "prejuizo";
}

export function serviceCalc(snap: PricingSnapshot, svc: Service): ServiceCalc {
  const months = Math.max(1, svc.contract_months);
  const cost = serviceCost(snap, svc);
  const ml = snap.markup_lines[svc.line];
  const mk = markupRate(ml);
  const ideal = cost * mk;
  const practiced = svc.practiced_price;
  const margin_value = (practiced - cost) / months;
  const margin_pct = practiced > 0 ? (practiced - cost) / practiced : 0;
  const delta = ideal > 0 ? (practiced - ideal) / ideal : 0;
  let status: ServiceCalc["status"];
  if (practiced < cost) status = "prejuizo";
  else if (delta < -0.05) status = "abaixo_ideal";
  else if (delta > 0.1) status = "acima_ideal";
  else status = "preco_bom";
  return {
    cost_total: cost,
    cost_monthly: cost / months,
    practiced_total: practiced,
    practiced_monthly: practiced / months,
    markup: mk,
    ideal_price_total: ideal,
    ideal_price_monthly: ideal / months,
    margin_value,
    margin_pct,
    delta_vs_ideal_pct: delta,
    status,
  };
}

export function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(v || 0);
}

export function fmtPct(v: number, digits = 1): string {
  return `${((v || 0) * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number, digits = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v || 0);
}

export const emptySnapshot = (): PricingSnapshot => ({
  version: 1,
  currency: "BRL",
  capacity: { people: 1, hours_per_day: 8, work_days: 220, productivity_pct: 0.85 },
  fixed_costs: [],
  labor_costs: [],
  markup_lines: {
    premium: {
      tax_pct: 0.08,
      commission_pct: 0.1,
      gateway_pct: 0.05,
      investment_pct: 0.06,
      sales_commission_pct: 0.0134,
      fixed_expense_pct: 0.168,
      churn_pct: 0.06,
      profit_pct: 0.3,
    },
    gold: {
      tax_pct: 0.08,
      commission_pct: 0.1,
      gateway_pct: 0.05,
      investment_pct: 0.06,
      sales_commission_pct: 0.0134,
      fixed_expense_pct: 0.168,
      churn_pct: 0.06,
      profit_pct: 0.2,
    },
    prata: {
      tax_pct: 0.08,
      commission_pct: 0.1,
      gateway_pct: 0.05,
      investment_pct: 0.06,
      sales_commission_pct: 0.0134,
      fixed_expense_pct: 0.168,
      churn_pct: 0.06,
      profit_pct: 0.1,
    },
  },
  inputs: [],
  subproducts: [],
  services: [],
});

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
