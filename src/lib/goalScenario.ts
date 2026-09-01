/**
 * ===== Cenários de crescimento das Metas =====
 *
 * As metas cadastradas embutem um crescimento de ~1% a.m. no Total de MRR.
 * Este módulo permite SIMULAR cenários mais agressivos (5%, 10%, custom) sem
 * tocar no banco: as metas são recalculadas em memória por crescimento composto.
 *
 * Regras:
 *  - Total de MRR (estoque) do mês N = base × (1 + g)^N, com base = primeiro mês
 *    da série cadastrada (mantido intacto).
 *  - Net MRR (fluxo) = estoque do mês − estoque do mês anterior.
 *  - Metas de saída (churn, downsell, MRR Decrease) ficam mais rígidas na mesma
 *    proporção do cenário: alvo × (1 − g).
 *  - MRR Increase = Net MRR alvo + saída ajustada. A diferença é distribuída
 *    entre as categorias de entrada na proporção que já têm no cadastro.
 *  - Metas de contagem seguem o fator da categoria de MRR correspondente.
 */

export interface ScenarioGoalLike {
  category_id: string | null;
  period_start: string;
  period_end: string;
  target_mrr?: number | null;
  target_deals?: number | null;
  target_tpv?: number | null;
  target_pct?: number | null;
}

export interface ScenarioCategoryLike {
  id: string;
  slug: string;
  goal_direction?: string | null;
  component_category_ids?: string[] | null;
}

export const SCENARIO_STORAGE_KEY = "goals_growth_scenario_v1";

/** Crescimento a.m. já embutido no cadastro (apenas informativo na UI). */
export const BASELINE_GROWTH_PCT = 1;

export const SCENARIO_PRESETS = [0, 5, 10] as const;

/** Estoque (nível), cresce de forma composta. */
const STOCK_SLUGS = new Set([
  "total_de_mrr_ms3g6o38",
  "usuarios_ativos_pagantes_ms8yyce5",
  "stripe_mrr_yampa20",
  "stripe_ativos_yampa20",
]);

const TOTAL_MRR_SLUG = "total_de_mrr_ms3g6o38";
const NET_MRR_SLUG = "net-mrr";
const INCREASE_SLUG = "mrr_increase";
const DECREASE_SLUG = "mrr_decrease";
/** Componentes de entrada que absorvem a exigência extra. */
const INFLOW_SLUGS = new Set([
  "new_mrr",
  "recuperados",
  "upsell",
  "recuperacao_ft",
  "vendas_do_dia",
  "mrr_increase",
]);
/** Componentes de saída (ficam mais rígidos). */
const OUTFLOW_SLUGS = new Set(["churn-mrr", "downsell", "mrr_decrease", "churn-logos", "churn-rate-logos"]);

export function monthKeyOf(dateStr: string): string {
  return String(dateStr).slice(0, 7);
}

function isLowerBetter(direction?: string | null) {
  return direction === "lte" || direction === "lt";
}

/** Fatores por `categoryId|YYYY-MM`. Vazio quando o cenário é o cadastrado. */
export interface ScenarioBaseline {
  /** YYYY-MM do mês de referência anterior ao primeiro mês projetado */
  month: string;
  /** Total de MRR realizado nesse mês */
  value: number;
  /**
   * Total de MRR realizado por mês (`YYYY-MM` -> valor). Cada mês projeta sobre
   * o REALIZADO do mês anterior — dado imutável — de forma que a meta de um mês
   * encerrado nunca mude quando o mês seguinte começa.
   */
  realizedByMonth?: Record<string, number>;
}

/**
 * Primeiro mês em que a projeção por crescimento passou a valer. Meses
 * anteriores mantêm exatamente a meta cadastrada (histórico intocado).
 */
export const PROJECTION_START_MONTH = "2026-08";

/** Mês anterior a `YYYY-MM`. */
export function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}


/** Revisão da base de crescimento cadastrada (vale do mês de início em diante). */
export interface GrowthBaseline {
  /** YYYY-MM ou data ISO */
  effective_month: string;
  growth_pct: number;
}

/**
 * Resolve o crescimento (decimal) aplicável a cada mês:
 *  - cenário selecionado (> 0) sobrepõe a base para todos os meses;
 *  - sem cenário, vale a revisão de base mais recente com início <= mês;
 *  - meses anteriores à primeira revisão ficam em 0 (metas cadastradas).
 */
export function makeGrowthRate(
  growthPct: number,
  baselines?: GrowthBaseline[] | null,
): (month: string) => number {
  const scenario = Number(growthPct) || 0;
  const sorted = (baselines || [])
    .map((b) => ({ month: monthKeyOf(String(b.effective_month)), pct: Number(b.growth_pct) || 0 }))
    .sort((a, b) => a.month.localeCompare(b.month));
  return (month: string) => {
    if (scenario > 0 && isFinite(scenario)) return scenario / 100;
    let pct = BASELINE_GROWTH_PCT;
    for (const b of sorted) if (b.month <= month) pct = b.pct;
    return pct >= 0 && isFinite(pct) ? pct / 100 : BASELINE_GROWTH_PCT / 100;
  };
}

export function buildScenarioFactors(
  goals: ScenarioGoalLike[],
  categories: ScenarioCategoryLike[],
  growthPct: number,
  /** Ancora o cenário no último fechamento real; meses anteriores ficam intactos. */
  baseline?: ScenarioBaseline | null,
  /** Revisões da base de crescimento cadastradas no banco. */
  baselines?: GrowthBaseline[] | null,
): Map<string, number> {
  const factors = new Map<string, number>();
  const rateAt = makeGrowthRate(growthPct, baselines);
  const scenarioG = Number(growthPct) / 100;
  const hasScenario = isFinite(scenarioG) && scenarioG > 0;
  const hasBase = (baselines || []).some((b) => (Number(b.growth_pct) || 0) > 0);
  if (!hasScenario && !hasBase) return factors;


  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const byId = new Map(categories.map((c) => [c.id, c]));

  // Metas originais por categoria/mês (soma, caso haja múltiplos escopos)
  const orig = new Map<string, number>(); // `${categoryId}|${month}`
  const months = new Set<string>();
  for (const goal of goals) {
    if (!goal.category_id) continue;
    const month = monthKeyOf(goal.period_start);
    const value =
      Number(goal.target_pct || 0) ||
      Number(goal.target_mrr || 0) ||
      Number(goal.target_deals || 0) ||
      Number(goal.target_tpv || 0);
    if (!value) continue;
    months.add(month);
    const key = `${goal.category_id}|${month}`;
    orig.set(key, (orig.get(key) ?? 0) + value);
  }
  const monthList = Array.from(months).sort();
  if (!monthList.length) return factors;

  const totalMrrCat = bySlug.get(TOTAL_MRR_SLUG);
  const origTotal = (m: string) => (totalMrrCat ? orig.get(`${totalMrrCat.id}|${m}`) ?? 0 : 0);

  // ===== Estoque de MRR por crescimento composto =====
  // Cada mês projeta sobre o REALIZADO do mês anterior (dado imutável). Quando
  // o mês anterior ainda não tem realizado (futuro), compõe sobre o projetado.
  // Meses antes de `startMonth` mantêm a meta cadastrada — o passado não muda.
  const newStock = new Map<string, number>();
  const realizedOf = (m: string) => Number(baseline?.realizedByMonth?.[m] ?? 0);
  const anchorMonth = baseline?.month
    ? baseline.month
    : monthList[Math.max(0, monthList.findIndex((m) => origTotal(m) > 0))];
  const anchorValue =
    baseline?.month && Number(baseline.value) > 0 ? Number(baseline.value) : origTotal(anchorMonth);
  // Sem realizados por mês, mantém o comportamento antigo (âncora única).
  const startMonth = baseline?.realizedByMonth ? PROJECTION_START_MONTH : anchorMonth;

  const stockPrevOf = new Map<string, number>();
  let prev = 0;
  monthList.forEach((m) => {
    if (m < startMonth) {
      newStock.set(m, origTotal(m));
      prev = 0;
      return;
    }
    if (!baseline?.realizedByMonth && m === startMonth) {
      newStock.set(m, anchorValue);
      prev = anchorValue;
      return;
    }
    const pm = prevMonthKey(m);
    const base =
      realizedOf(pm) ||
      (prev > 0 ? prev : anchorMonth === pm && anchorValue > 0 ? anchorValue : origTotal(pm));
    stockPrevOf.set(m, base);
    prev = base * (1 + rateAt(m));
    newStock.set(m, prev);
  });


  const stockFactor = new Map<string, number>();
  monthList.forEach((m) => {
    const o = origTotal(m);
    const n = newStock.get(m) ?? o;
    stockFactor.set(m, o > 0 ? n / o : 1);
  });


  // ===== Net MRR alvo e exigência de entrada =====
  const inflowFactor = new Map<string, number>();
  const netFactor = new Map<string, number>();
  const decreaseCat = bySlug.get(DECREASE_SLUG);
  const increaseCat = bySlug.get(INCREASE_SLUG);
  const netCat = bySlug.get(NET_MRR_SLUG);

  const componentSum = (cat: ScenarioCategoryLike | undefined, m: string) => {
    if (!cat) return 0;
    const comps = cat.component_category_ids ?? [];
    if (comps.length) {
      return comps.reduce((s, id) => s + (orig.get(`${id}|${m}`) ?? 0), 0);
    }
    return orig.get(`${cat.id}|${m}`) ?? 0;
  };

  monthList.forEach((m, idx) => {
    const prevMonth = idx > 0 ? monthList[idx - 1] : null;
    const stockNow = newStock.get(m) ?? 0;
    // Base do fluxo: a MESMA base usada na projeção do estoque (realizado do
    // mês anterior). Fora dela, cai no mês anterior da série / âncora.
    const stockPrev =
      stockPrevOf.get(m) ??
      (prevMonth ? newStock.get(prevMonth) ?? 0 : m > anchorMonth ? anchorValue : 0);
    const origNet = netCat ? orig.get(`${netCat.id}|${m}`) ?? 0 : 0;
    const netTarget = stockPrev > 0 ? stockNow - stockPrev : origNet;


    netFactor.set(m, origNet > 0 ? Math.max(1, netTarget / origNet) : 1);

    const gm = rateAt(m);
    const origDecrease = componentSum(decreaseCat, m);
    const adjDecrease = origDecrease * (1 - gm);
    const origIncrease = componentSum(increaseCat, m);
    const required = netTarget + adjDecrease;
    inflowFactor.set(m, origIncrease > 0 ? Math.max(1, required / origIncrease) : 1 + gm);

  });

  // ===== Fator final por categoria/mês =====
  for (const [key] of orig) {
    const [catId, month] = key.split("|");
    const untouched = baseline?.realizedByMonth ? month < startMonth : month <= anchorMonth;
    if (untouched) {
      factors.set(key, 1);
      continue;
    }

    const cat = byId.get(catId);
    const slug = cat?.slug ?? "";
    const gm = rateAt(month);
    let f: number;
    if (STOCK_SLUGS.has(slug)) {
      f = stockFactor.get(month) ?? 1;
    } else if (slug === NET_MRR_SLUG) {
      f = netFactor.get(month) ?? 1;
    } else if (OUTFLOW_SLUGS.has(slug) || isLowerBetter(cat?.goal_direction)) {
      f = 1 - gm;
    } else if (INFLOW_SLUGS.has(slug) || !isLowerBetter(cat?.goal_direction)) {
      f = inflowFactor.get(month) ?? 1 + gm;

    } else {
      f = 1;
    }
    factors.set(key, f);
  }

  // Meses sem meta cadastrada de alguma categoria: fator geral de entrada
  return factors;
}

/** Fator de uma categoria/mês (1 quando não há cenário). */
export function scenarioFactorFor(
  factors: Map<string, number>,
  categoryId: string | null | undefined,
  monthOrDate: string,
): number {
  if (!factors.size || !categoryId) return 1;
  return factors.get(`${categoryId}|${monthKeyOf(monthOrDate)}`) ?? 1;
}

/** Aplica o cenário a uma lista de metas (`goals`), preservando o formato. */
export function applyScenarioToGoals<T extends ScenarioGoalLike>(
  goals: T[],
  categories: ScenarioCategoryLike[],
  growthPct: number,
  baseline?: ScenarioBaseline | null,
  baselines?: GrowthBaseline[] | null,
): T[] {
  const factors = buildScenarioFactors(goals, categories, growthPct, baseline, baselines);
  if (!factors.size) return goals;
  return goals.map((goal) => {
    const f = scenarioFactorFor(factors, goal.category_id, goal.period_start);
    if (f === 1) return goal;
    return {
      ...goal,
      target_mrr: goal.target_mrr ? Number(goal.target_mrr) * f : goal.target_mrr,
      target_deals: goal.target_deals ? Number(goal.target_deals) * f : goal.target_deals,
      target_tpv: goal.target_tpv ? Number(goal.target_tpv) * f : goal.target_tpv,
      target_pct: goal.target_pct ? Number(goal.target_pct) * f : goal.target_pct,
    };
  });
}

/**
 * Fator médio de fluxo (entrada) do mês de referência — usado para elevar
 * metas diárias/semanais do painel tático, que não têm categoria.
 */
export function scenarioDailyFactor(
  goals: ScenarioGoalLike[],
  categories: ScenarioCategoryLike[],
  growthPct: number,
  ref: Date,
  baseline?: ScenarioBaseline | null,
  baselines?: GrowthBaseline[] | null,
): number {
  const month = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const rateAt = makeGrowthRate(growthPct, baselines);
  const configuredRate = rateAt(month);
  const hasScenario = Number(growthPct) > 0 && isFinite(Number(growthPct));
  if (!hasScenario && configuredRate <= 0) return 1;
  const factors = buildScenarioFactors(goals, categories, growthPct, baseline, baselines);
  const increase = categories.find((c) => c.slug === INCREASE_SLUG);
  if (increase) {
    const f = factors.get(`${increase.id}|${month}`);
    if (f && f > 0) return f;
  }
  return 1 + configuredRate;
}

export function scenarioLabel(growthPct: number, baseGrowthPct = BASELINE_GROWTH_PCT): string {
  if (!growthPct) {
    const base = Number.isInteger(baseGrowthPct) ? String(baseGrowthPct) : baseGrowthPct.toFixed(1).replace(".", ",");
    return `Cadastrado (${base}%)`;
  }
  const v = Number.isInteger(growthPct) ? String(growthPct) : growthPct.toFixed(1).replace(".", ",");
  return `Cenário ${v}%`;
}
