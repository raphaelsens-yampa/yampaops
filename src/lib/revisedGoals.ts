/**
 * Meta Revisada — rebalanceamento trimestral do déficit.
 *
 * Regra: quando um mês encerrado fica abaixo da meta, o déficit é diluído
 * igualmente entre os meses restantes do MESMO trimestre. Superávit nunca
 * abate metas futuras. Categorias "menor é melhor" (churn) usam a matemática
 * invertida: o excesso realizado reduz a meta (limite) dos meses seguintes.
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
}

export function computeRevisedTargets({
  targetByCatMonth,
  realizedByCatMonth,
  categoryIds,
  currentMonthIdx,
  lowerIsBetter,
}: ComputeRevisedInput): RevisedTargets {
  const revisedByCatMonth = new Map<string, number>();
  const addedByCatMonth = new Map<string, number>();
  const unrecoveredByCatQuarter = new Map<string, number>();

  for (const catId of categoryIds) {
    const lte = lowerIsBetter?.(catId) ?? false;

    for (let q = 0; q < 4; q++) {
      const months = [q * 3, q * 3 + 1, q * 3 + 2];

      let deficit = 0;
      for (const idx of months) {
        if (idx >= currentMonthIdx) continue; // mês ainda aberto
        const t = targetByCatMonth.get(`${catId}|${idx}`) || 0;
        if (t <= 0) continue;
        const r = realizedByCatMonth.get(`${catId}|${idx}`) || 0;
        deficit += lte ? Math.max(0, r - t) : Math.max(0, t - r);
      }

      const remaining = months.filter(
        (idx) => idx >= currentMonthIdx && (targetByCatMonth.get(`${catId}|${idx}`) || 0) > 0,
      );

      // meta revisada = meta original para os meses sem herança
      for (const idx of months) {
        const t = targetByCatMonth.get(`${catId}|${idx}`) || 0;
        revisedByCatMonth.set(`${catId}|${idx}`, t);
      }

      if (deficit <= 0) continue;

      if (!remaining.length) {
        unrecoveredByCatQuarter.set(`${catId}|${q}`, deficit);
        continue;
      }

      const share = deficit / remaining.length;
      for (const idx of remaining) {
        const t = targetByCatMonth.get(`${catId}|${idx}`) || 0;
        const revised = lte ? Math.max(0, t - share) : t + share;
        revisedByCatMonth.set(`${catId}|${idx}`, revised);
        addedByCatMonth.set(`${catId}|${idx}`, Math.abs(revised - t));
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
