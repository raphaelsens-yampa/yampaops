/**
 * Meta Revisada — rebalanceamento trimestral do déficit.
 *
 * Regra: quando um mês encerrado fica abaixo da meta, o déficit é diluído
 * igualmente entre os meses restantes do MESMO trimestre. Superávit nunca
 * abate metas futuras. Categorias "menor é melhor" (churn) usam a matemática
 * invertida: o excesso realizado reduz a meta (limite) dos meses seguintes.
 *
 * IMPORTANTE — a revisão é CONGELADA ("as of"): a meta revisada de cada mês é
 * calculada com a informação disponível no início daquele mês. Assim, um mês
 * encerrado nunca tem sua meta revisada alterada depois (o valor exibido é o
 * mesmo que foi usado durante o mês). Só meses vigentes/futuros continuam
 * absorvendo novos déficits.
 */

export interface RevisedTargets {
  /** catId|monthIdx -> meta revisada */
  revisedByCatMonth: Map<string, number>;
  /** catId|monthIdx -> quanto foi herdado (positivo = mais exigente) */
  addedByCatMonth: Map<string, number>;
  /** catId|quarterIdx -> déficit que não cabe mais no trimestre */
  unrecoveredByCatQuarter: Map<string, number>;
}

export interface ComputeRevisedInput {
  targetByCatMonth: Map<string, number>;
  realizedByCatMonth: Map<string, number>;
  categoryIds: string[];
  /** meses com índice menor que este são considerados encerrados */
  currentMonthIdx: number;
  lowerIsBetter?: (catId: string) => boolean;
  /**
   * Permite apurar o déficit de uma categoria a partir de OUTRA categoria.
   * Usado para amarrar indicadores de fluxo ao estoque correspondente
   * (ex.: Net MRR herda exatamente o déficit do Total de MRR), evitando que
   * a mesma defasagem gere revisões de tamanhos diferentes.
   */
  deficitSourceFor?: (catId: string) => string | null | undefined;
  /**
   * Mapas de apoio para as categorias-fonte do déficit. Necessários quando a
   * tela está filtrada por uma categoria (ex.: só Net MRR): sem eles a fonte
   * (Total de MRR) não estaria nos mapas principais e o déficit sairia zero.
   */
  sourceTargetByCatMonth?: Map<string, number>;
  sourceRealizedByCatMonth?: Map<string, number>;
}

export function computeRevisedTargets({
  targetByCatMonth,
  realizedByCatMonth,
  categoryIds,
  currentMonthIdx,
  lowerIsBetter,
  deficitSourceFor,
  sourceTargetByCatMonth,
  sourceRealizedByCatMonth,
}: ComputeRevisedInput): RevisedTargets {
  const revisedByCatMonth = new Map<string, number>();
  const addedByCatMonth = new Map<string, number>();
  const unrecoveredByCatQuarter = new Map<string, number>();

  for (const catId of categoryIds) {
    const lte = lowerIsBetter?.(catId) ?? false;
    const srcId = deficitSourceFor?.(catId) || catId;
    const isExternalSrc = srcId !== catId;

    const targetOf = (id: string, idx: number) => targetByCatMonth.get(`${id}|${idx}`) || 0;
    const srcTargetOf = (idx: number) => {
      const own = targetOf(srcId, idx);
      if (own > 0 || !isExternalSrc) return own;
      return sourceTargetByCatMonth?.get(`${srcId}|${idx}`) || 0;
    };
    const srcRealizedOf = (idx: number) => {
      const own = realizedByCatMonth.get(`${srcId}|${idx}`) || 0;
      if (own > 0 || !isExternalSrc) return own;
      return sourceRealizedByCatMonth?.get(`${srcId}|${idx}`) || 0;
    };
    const gapAt = (idx: number) => {
      const t = srcTargetOf(idx);
      if (t <= 0) return 0;
      const r = srcRealizedOf(idx);
      return lte ? Math.max(0, r - t) : Math.max(0, t - r);
    };


    for (let q = 0; q < 4; q++) {
      const months = [q * 3, q * 3 + 1, q * 3 + 2];

      // baseline: meta revisada = meta original
      for (const idx of months) {
        revisedByCatMonth.set(`${catId}|${idx}`, targetOf(catId, idx));
      }

      for (const idx of months) {
        // "as of": para meses encerrados vale a foto do início daquele mês.
        const effClosed = Math.min(idx, currentMonthIdx);
        let deficit = 0;
        for (const j of months) {
          if (j >= effClosed) continue;
          deficit += gapAt(j);
        }
        if (deficit <= 0) continue;

        const remaining = months.filter((m) => m >= effClosed && targetOf(catId, m) > 0);
        if (!remaining.length || !remaining.includes(idx)) continue;

        const share = deficit / remaining.length;
        const t = targetOf(catId, idx);
        const revised = lte ? Math.max(0, t - share) : t + share;
        revisedByCatMonth.set(`${catId}|${idx}`, revised);
        addedByCatMonth.set(`${catId}|${idx}`, Math.abs(revised - t));
      }

      // Déficit que não cabe mais no trimestre (nenhum mês aberto restante)
      let deficitNow = 0;
      for (const j of months) {
        if (j >= currentMonthIdx) continue;
        deficitNow += gapAt(j);
      }
      const remainingNow = months.filter((m) => m >= currentMonthIdx && targetOf(catId, m) > 0);
      if (deficitNow > 0 && !remainingNow.length) {
        unrecoveredByCatQuarter.set(`${catId}|${q}`, deficitNow);
      }
    }
  }

  return { revisedByCatMonth, addedByCatMonth, unrecoveredByCatQuarter };
}


/** Ritmo diário necessário para fechar o mês na meta (usado nas Metas Táticas). */
export function adjustedDailyTarget(params: {
  dailyTarget: number;
  realizedBeforeToday: number;
  monthTarget?: number;
  businessDaysInMonth: number;
  remainingBusinessDays: number;
}): number {
  const { dailyTarget, realizedBeforeToday, businessDaysInMonth, remainingBusinessDays } = params;
  if (dailyTarget <= 0) return 0;
  const monthTarget = params.monthTarget ?? dailyTarget * businessDaysInMonth;
  if (remainingBusinessDays <= 0) return dailyTarget;
  return Math.max(0, (monthTarget - realizedBeforeToday) / remainingBusinessDays);
}

/* ────────────────────────────────────────────────────────────────
 * Metas semanais vivas — rebalanceamento entre semanas do mês.
 *
 * Semanas fechadas e a semana vigente mantêm a meta original
 * (dado oficializado). O saldo que falta para fechar a meta do mês
 * é rateado entre as semanas futuras por dias úteis.
 * ──────────────────────────────────────────────────────────────── */

export type WeekStatus = "closed" | "current" | "future";

export interface WeeklyRevisionInput {
  businessDays: number;
  originalTarget: number | null;
  realized: number | null;
  status: WeekStatus;
}

export interface WeeklyRevisionOutput {
  revisedTarget: number | null;
  /** revisada - original (positivo = mais exigente). null quando não há revisão. */
  delta: number | null;
}

export interface WeeklyRevisionResult {
  weeks: WeeklyRevisionOutput[];
  /** Saldo que não cabe mais no mês (sem semanas futuras disponíveis). */
  unrecovered: number;
}

export function computeRevisedWeeklyTargets({
  weeks,
  monthTarget,
  lowerIsBetter = false,
  allowDecrease,
}: {
  weeks: WeeklyRevisionInput[];
  monthTarget: number;
  lowerIsBetter?: boolean;
  /**
   * Permite que a meta revisada fique ABAIXO da original (alívio por superávit).
   * Padrão: só nas categorias "menor é melhor" (teto). Em crescimento, bater a
   * meta antes do tempo nunca reduz as semanas futuras.
   */
  allowDecrease?: boolean;
}): WeeklyRevisionResult {
  const canDecrease = allowDecrease ?? lowerIsBetter;
  const keep = (w: WeeklyRevisionInput): WeeklyRevisionOutput => ({
    revisedTarget: w.originalTarget,
    delta: w.originalTarget === null ? null : 0,
  });

  if (!monthTarget || monthTarget <= 0) {
    return { weeks: weeks.map(keep), unrecovered: 0 };
  }

  const closedRealized = weeks
    .filter((w) => w.status === "closed")
    .reduce((s, w) => s + (w.realized ?? 0), 0);
  const currentTarget = weeks
    .filter((w) => w.status === "current")
    .reduce((s, w) => s + (w.originalTarget ?? 0), 0);

  const saldo = monthTarget - closedRealized - currentTarget;

  const future = weeks.filter((w) => w.status === "future");
  const totalBD = future.reduce((s, w) => s + Math.max(0, w.businessDays), 0);

  if (!future.length || totalBD <= 0) {
    return {
      weeks: weeks.map((w) =>
        w.status === "future" && canDecrease
          ? { revisedTarget: 0, delta: -(w.originalTarget ?? 0) }
          : keep(w),
      ),
      unrecovered: Math.max(0, lowerIsBetter ? -saldo : saldo),
    };
  }

  const pool = Math.max(0, saldo);

  return {
    weeks: weeks.map((w) => {
      if (w.status !== "future") return keep(w);
      const rateio = (pool * Math.max(0, w.businessDays)) / totalBD;
      const original = w.originalTarget ?? 0;
      const revised = canDecrease ? rateio : Math.max(original, rateio);
      return { revisedTarget: revised, delta: revised - original };
    }),
    unrecovered: 0,
  };
}

