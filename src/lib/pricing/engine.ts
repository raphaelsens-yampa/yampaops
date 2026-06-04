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

/** Soma das despesas fixas mensais (não inclui mão de obra). */
export function totalFixedCost(snap: PricingSnapshot): number {
  return sumCosts(snap.fixed_costs);
}

/** Soma da mão de obra direta mensal. */
export function totalLaborCost(snap: PricingSnapshot): number {
  return sumCosts(snap.labor_costs);
}

/**
 * Custo por minuto produtivo — fiel à planilha:
 *   (mão de obra direta mensal × 12) ÷ minutos produtivos anuais
 * A despesa fixa NÃO entra aqui — ela é absorvida via `fixed_expense_pct`
 * no markup (despesa fixa ÷ faturamento previsto).
 */
export function costPerMinute(snap: PricingSnapshot): number {
  const c = snap.capacity;
  const totalMinutes =
    c.people * c.hours_per_day * 60 * c.work_days * c.productivity_pct;
  if (!totalMinutes) return 0;
  const annualLabor = totalLaborCost(snap) * 12;
  return annualLabor / totalMinutes;
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

/**
 * Base de faturamento mensal a usar para derivar a despesa fixa %.
 * Espelha a planilha: muda conforme o cenário (previsto vs. real).
 */
export function revenueBaseMonthly(snap: PricingSnapshot): number {
  const r = snap.revenue;
  if (!r) return 0;
  return r.mode === "actual" ? r.actual_monthly : r.forecasted_monthly;
}

/** % despesa fixa derivado: despesa fixa mensal / faturamento mensal. */
export function derivedFixedExpensePct(snap: PricingSnapshot): number {
  const base = revenueBaseMonthly(snap);
  if (!base) return 0;
  return totalFixedCost(snap) / base;
}

/**
 * Linha de markup "efetiva" — se `revenue.auto_fixed_expense` estiver ligado,
 * sobrescreve `fixed_expense_pct` pelo valor derivado do faturamento atual.
 */
export function effectiveLine(snap: PricingSnapshot, l: MarkupLine): MarkupLine {
  if (snap.revenue?.auto_fixed_expense) {
    return { ...l, fixed_expense_pct: derivedFixedExpensePct(snap) };
  }
  return l;
}

/** Markup efetivo (já considera o cenário de receita). */
export function effectiveMarkupRate(snap: PricingSnapshot, l: MarkupLine): number {
  return markupRate(effectiveLine(snap, l));
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
  const mk = effectiveMarkupRate(snap, ml);
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

/**
 * Memoized calculation context for a snapshot.
 * Computes cost-per-minute, input costs and subproduct costs ONCE per snap,
 * instead of recomputing inside every recipeRefCost/serviceCalc call.
 */
export interface PricingCtx {
  snap: PricingSnapshot;
  fixed: number;
  labor: number;
  cpm: number;
  inputCost: (id: string) => number;
  subproductCost: (id: string) => number;
  recipeRefCost: (ref: RecipeRef) => number;
  serviceCost: (svc: Service) => number;
  serviceCalc: (svc: Service) => ServiceCalc;
}

export function createPricingCtx(snap: PricingSnapshot): PricingCtx {
  const fixed = totalFixedCost(snap);
  const labor = totalLaborCost(snap);
  const c = snap.capacity;
  const totalMinutes =
    c.people * c.hours_per_day * 60 * c.work_days * c.productivity_pct;
  const cpm = totalMinutes ? (labor * 12) / totalMinutes : 0;


  const inputCostMap = new Map<string, number>();
  for (const i of snap.inputs) {
    inputCostMap.set(i.id, (Number(i.minutes) || 0) * cpm);
  }

  const subCostMap = new Map<string, number>();
  const visiting = new Set<string>();
  const subById = new Map(snap.subproducts.map((s) => [s.id, s]));

  const inputCost = (id: string) => inputCostMap.get(id) ?? 0;

  const subproductCost = (id: string): number => {
    const cached = subCostMap.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    const sub = subById.get(id);
    if (!sub) return 0;
    visiting.add(id);
    let total = 0;
    if (sub.items && sub.items.length > 0) {
      for (const it of sub.items) total += refCost(it);
    } else {
      total = sub.cached_cost ?? 0;
    }
    visiting.delete(id);
    subCostMap.set(id, total);
    return total;
  };

  const refCost = (ref: RecipeRef): number => {
    const qty = Number(ref.qty) || 0;
    if (!qty) return 0;
    if (ref.kind === "input") return qty * inputCost(ref.ref);
    return qty * subproductCost(ref.ref);
  };

  // Pre-warm subproducts so later service calcs are O(1) per ref.
  for (const sp of snap.subproducts) subproductCost(sp.id);

  const serviceCost = (svc: Service): number =>
    svc.recipe.reduce((s, r) => s + refCost(r), 0);

  const markupCache = new Map<MarkupLineKey, number>();
  const getMarkup = (k: MarkupLineKey): number => {
    const c = markupCache.get(k);
    if (c !== undefined) return c;
    const m = effectiveMarkupRate(snap, snap.markup_lines[k]);
    markupCache.set(k, m);
    return m;
  };

  const calc = (svc: Service): ServiceCalc => {
    const months = Math.max(1, svc.contract_months);
    const cost = serviceCost(svc);
    const mk = getMarkup(svc.line);
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
  };

  return {
    snap,
    fixed,
    labor,
    cpm,
    inputCost,
    subproductCost,
    recipeRefCost: refCost,
    serviceCost,
    serviceCalc: calc,
  };
}

