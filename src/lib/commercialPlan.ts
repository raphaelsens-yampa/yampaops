/**
 * ===== Planejamento Comercial =====
 *
 * Cálculos puros da seção: bridge mensal de MRR (Plano de MRR), rateio de
 * quotas por vendedor (performance histórica) e cobertura de pipeline
 * (cálculo reverso com as taxas dos Funis CRM).
 *
 * Regras do plano:
 *  - O MRR previsto de cada mês continua do valor REAL do mês anterior
 *    (realizado de meses já fechados; mês em curso entra como projeção).

 *  - Sem cadastro manual (override), o New MRR alvo do mês N é o necessário
 *    para fechar o estoque do mês em MRR_start × (1 + g) : New = ΔMRR + Churn.
 *  - Churn MRR alvo = média do churn realizado dos últimos 3 meses fechados
 *    (pode ser sobrescrito no cadastro do mês).
 *  - Cenário ativo (Otimista/Pessimista/Personalizado) substitui a taxa
 *    da base de crescimento em todo o plano.
 */

export interface RealizedMonth {
  yearMonth: string; // "YYYY-MM"
  newMrr: number | null;
  churnMrr: number | null;
  netMrr: number | null;
  totalMrr: number | null;
  ativos: number | null;
}

export interface GrowthBaselineLike {
  effective_month: string;
  growth_pct: number | string | null;
}

export interface PlanOverrideLike {
  target_new_mrr: number | string | null;
  target_churn_mrr: number | string | null;
  target_deals: number | string | null;
  target_ativos: number | string | null;
}

export interface PlanRow {
  yearMonth: string;
  /** % a.m. aplicada na geração (informativo). */
  growthPct: number;
  newMrrTarget: number | null;
  churnMrrTarget: number | null;
  /** New MRR alvo − Churn MRR alvo. */
  netMrrTarget: number | null;
  mrrStart: number | null;
  mrrEnd: number | null;
  ativosStart: number | null;
  ativosTarget: number | null;
  dealsTarget: number | null;
  source: "override" | "generated";
  realized: RealizedMonth | null;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKeyOf(d);
}

/** Janela do plano: `pastMonths` meses atrás + o mês vigente + `futureMonths` à frente. */
export function planWindow(anchor = new Date(), pastMonths = 3, futureMonths = 12): string[] {
  const out: string[] = [];
  for (let i = -pastMonths; i <= futureMonths; i++) out.push(addMonths(monthKeyOf(anchor), i));
  return out;
}

/** Taxa a.m. aplicável ao mês: último baseline com effective_month <= mês; senão o primeiro cadastrado. */
export function growthPctForMonth(baselines: GrowthBaselineLike[], yearMonth: string): number {
  const applicable = baselines.filter((b) => String(b.effective_month || "").slice(0, 7) <= yearMonth);
  if (applicable.length) return num(applicable[applicable.length - 1].growth_pct) ?? 0;
  if (baselines.length) return num(baselines[0].growth_pct) ?? 0;
  return 0;
}

export function averageOf(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Média do churn MRR realizado nos `months` meses imediatamente anteriores a `beforeMonth`. */
export function averageChurnMrr(realized: RealizedMonth[], beforeMonth: string, months = 3): number | null {
  const vals = realized
    .filter((r) => r.yearMonth < beforeMonth && r.churnMrr != null)
    .map((r) => r.churnMrr as number)
    .slice(-months);
  return averageOf(vals);
}

/**
 * Regra canônica do New MRR por conversão do Stripe (igual ao placar
 * operacional): Upsell entra pelo delta líquido positivo; Nova venda e
 * Recuperação pelo MRR líquido da operação.
 */
export function newMrrFromConversions(
  rows: Array<{ mrr: number | string | null; mrr_net: number | string | null; delta_mrr: number | string | null; conversion_type?: string | null; is_reactivation?: boolean | null }>,
): number {
  return rows.reduce((sum, row) => {
    const type = String(row.conversion_type || "").toLowerCase();
    if (type === "upsell") return sum + Math.max(Number(row.delta_mrr || 0), 0);
    if (row.is_reactivation || type === "new" || !type) return sum + Number(row.mrr_net ?? row.mrr ?? 0);
    return sum;
  }, 0);
}

/**
 * Monta o bridge mensal do plano.
 *
 * @param seedMrr    MRR de referência anterior ao início da janela (total realizado). null → plano começa no 1º mês com realizado.
 * @param seedAtivos Ativos pagantes anteriores ao início da janela.
 * @param overrideGrowthPct cenário ativo (% a.m.); null = usar a base cadastrada.
 */
export function buildPlanMonths(opts: {
  window: string[];
  realized: RealizedMonth[];
  baselines: GrowthBaselineLike[];
  overrides: Record<string, PlanOverrideLike>;
  overrideGrowthPct?: number | null;
  avgChurn?: number | null;
  avgTicket?: number | null;
  /** YYYY-MM do último mês fechado. Realizado posterior a ele aparece na
   *  coluna Realizado, mas não reancora a cadeia (projetar sobre fechado). */
  closedThrough?: string | null;
}): PlanRow[] {
  const { window: months, realized, baselines, overrides, overrideGrowthPct, avgChurn, avgTicket, closedThrough } = opts;

  const realizedMap = new Map(realized.map((r) => [r.yearMonth, r]));

  let mrrPrev: number | null = null;
  let ativosPrev: number | null = null;
  if (months.length) {
    const before = realized
      .filter((r) => r.yearMonth < months[0] && r.totalMrr != null && (!closedThrough || r.yearMonth <= closedThrough))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    mrrPrev = before.length ? (before[before.length - 1].totalMrr as number) : null;
    const beforeAtivos = realized
      .filter((r) => r.yearMonth < months[0] && r.ativos != null && (!closedThrough || r.yearMonth <= closedThrough))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    ativosPrev = beforeAtivos.length ? (beforeAtivos[beforeAtivos.length - 1].ativos as number) : null;
  }


  return months.map((ym) => {
    const ov = overrides[ym] || null;
    const realizedRow = realizedMap.get(ym) || null;
    const g = overrideGrowthPct != null ? overrideGrowthPct : growthPctForMonth(baselines, ym);

    const churnOverride = num(ov?.target_churn_mrr);
    const churnTarget = churnOverride ?? avgChurn ?? null;
    const newOverride = num(ov?.target_new_mrr);
    const dealsOverride = num(ov?.target_deals);
    const ativosOverride = num(ov?.target_ativos);

    const mrrStart = mrrPrev;
    let newTarget: number | null = null;
    let mrrEnd: number | null = null;

    if (newOverride != null) {
      newTarget = newOverride;
      mrrEnd = mrrStart != null ? mrrStart + newTarget - (churnTarget ?? 0) : null;
    } else if (mrrStart != null) {
      const grown = mrrStart * (1 + g / 100);
      mrrEnd = grown;
      newTarget = grown - mrrStart + (churnTarget ?? 0);
    }

    const monthClosed = !closedThrough || ym <= closedThrough;
    if (monthClosed && realizedRow?.totalMrr != null) mrrEnd = realizedRow.totalMrr;


    let ativosTarget: number | null = null;
    const ativosStart = ativosPrev;
    if (ativosOverride != null) {
      ativosTarget = ativosOverride;
    } else if (ativosStart != null) {
      ativosTarget = Math.round(ativosStart * (1 + g / 100));
    }

    const dealsTarget = dealsOverride ?? (newTarget != null && avgTicket && avgTicket > 0 ? Math.round(newTarget / avgTicket) : null);

    const hasOverride = newOverride != null || churnOverride != null || dealsOverride != null || ativosOverride != null;

    // Encadeia para o próximo mês: prioridade ao realizado de mês FECHADO
    // (projetar sobre fechado — o parcial do mês em curso não ancora a cadeia).
    mrrPrev = monthClosed && realizedRow?.totalMrr != null ? realizedRow.totalMrr : mrrEnd;
    ativosPrev = monthClosed && realizedRow?.ativos != null ? realizedRow.ativos : ativosTarget;


    return {
      yearMonth: ym,
      growthPct: g,
      newMrrTarget: newTarget,
      churnMrrTarget: churnTarget,
      netMrrTarget: newTarget != null && churnTarget != null ? newTarget - churnTarget : null,
      mrrStart,
      mrrEnd,
      ativosStart,
      ativosTarget,
      dealsTarget,
      source: hasOverride ? "override" : "generated",
      realized: realizedRow,
    } satisfies PlanRow;
  });
}

/* ───────────────────────── Quotas ───────────────────────── */

export interface QuotaShareRow {
  sellerId: string;
  weight: number; // 0..1 — participação no rateio automático
  quotaNewMrr: number;
  isManual: boolean;
}

/**
 * Rateio da quota do mês entre vendedores proporcional ao New MRR realizado
 * na janela histórica. Linhas marcadas como manuais mantêm o valor salvo; o
 * saldo restante é rateado entre as automáticas.
 */
export function buildQuotaShares(params: {
  sellers: Array<{ id: string; name: string }>;
  history: Record<string, number>;
  totalQuota: number;
  saved?: Record<string, { quota_new_mrr: number | null; is_manual: boolean }>;
}): QuotaShareRow[] {
  const { sellers, history, totalQuota, saved = {} } = params;
  const totalHistory = sellers.reduce((s, x) => s + Math.max(Number(history[x.id] || 0), 0), 0);
  const manualSum = sellers.reduce((s, x) => {
    const row = saved[x.id];
    return row?.is_manual ? s + Math.max(Number(row.quota_new_mrr || 0), 0) : s;
  }, 0);
  const pool = Math.max(0, totalQuota - manualSum);

  return sellers.map((seller) => {
    const savedRow = saved[seller.id];
    const weight = totalHistory > 0 ? Math.max(Number(history[seller.id] || 0), 0) / totalHistory : 0;
    if (savedRow?.is_manual) {
      return { sellerId: seller.id, weight, quotaNewMrr: Math.max(Number(savedRow.quota_new_mrr || 0), 0), isManual: true };
    }
    return { sellerId: seller.id, weight, quotaNewMrr: Math.round(pool * weight * 100) / 100, isManual: false };
  });
}

/* ───────────────────── Cobertura de pipeline ───────────────────── */

export interface FunnelKpiLike {
  winRate: number | null;
  avgTicket: number | null;
}

export function averageFunnelKpis(list: FunnelKpiLike[]): { winRate: number | null; avgTicket: number | null } {
  return {
    winRate: averageOf(list.map((k) => k.winRate)),
    avgTicket: averageOf(list.map((k) => k.avgTicket)),
  };
}

export interface CoverageResult {
  /** Negócios que precisam entrar/ganhar no mês para bater a meta. */
  entradasNecessarias: number | null;
  /** Pipeline (R$) necessário para gerar essas entradas. */
  pipelineNecessario: number | null;
  /** Cobertura % = pipeline atual ÷ pipeline necessário. */
  coveragePct: number | null;
  /** Dentro do alvo de cobertura. */
  ok: boolean | null;
}

export function buildCoverage(params: {
  dealsNeeded: number | null;
  winRatePct: number | null;
  avgTicket: number | null;
  pipelineCurrent: number | null;
  /** Alvo de cobertura (1.0 = 100%). */
  targetCoverage?: number;
}): CoverageResult {
  const { dealsNeeded, winRatePct, avgTicket, pipelineCurrent, targetCoverage = 1 } = params;
  const wr = winRatePct != null && winRatePct > 0 ? winRatePct : null;
  const entradasNecessarias = dealsNeeded != null && wr != null ? dealsNeeded / (wr / 100) : null;
  const pipelineNecessario = entradasNecessarias != null && avgTicket != null && avgTicket > 0 ? entradasNecessarias * avgTicket : null;
  const coveragePct = pipelineNecessario != null && pipelineNecessario > 0 && pipelineCurrent != null
    ? (pipelineCurrent / pipelineNecessario) * 100
    : null;
  return {
    entradasNecessarias,
    pipelineNecessario,
    coveragePct,
    ok: coveragePct != null ? coveragePct >= targetCoverage * 100 : null,
  };
}
