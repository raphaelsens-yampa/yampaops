import { addDays, addYears, differenceInCalendarDays, startOfDay, startOfMonth, startOfQuarter } from "date-fns";
import { resolveDailyTarget, toBRDateKey, type DailyDatum, type TacticalGoal } from "./types";

/**
 * Filtro de período do Metas Táticas.
 *
 * O painel sempre mostrou a performance de UM dia (realizado de hoje x meta
 * diária). Este módulo permite acumular a performance "de ... até ..." uma
 * janela escolhida pelo usuário, com as mesmas regras já usadas no filtro de
 * recuperações: intervalo máximo de 1 ano e datas na timezone de São Paulo
 * (via `toBRDateKey`).
 */

export type TacticalPeriodPreset = "day" | "7" | "30" | "month" | "quarter" | "custom";

export interface TacticalPeriod {
  from: Date;
  to: Date;
}

/** Data final do período (a referência escolhida no seletor de data). */
export function tacticalPresetRange(
  preset: TacticalPeriodPreset,
  ref: Date,
  customFrom?: Date,
): TacticalPeriod {
  const to = startOfDay(ref);
  if (preset === "day") return { from: to, to };
  if (preset === "month") return { from: startOfMonth(to), to };
  if (preset === "quarter") return { from: startOfQuarter(to), to };
  if (preset === "custom") return { from: startOfDay(customFrom ?? to), to };
  return { from: addDays(to, -(Number(preset) - 1)), to };
}

/** Mesma regra do filtro de recuperações: no máximo 1 ano, sempre de até. */
export function tacticalPeriodError(period: TacticalPeriod): string | null {
  if (!Number.isFinite(period.from.getTime()) || !Number.isFinite(period.to.getTime())) {
    return "Selecione as duas datas.";
  }
  const from = startOfDay(period.from);
  const to = startOfDay(period.to);
  if (from > to) return "A data final deve ser igual ou posterior à inicial.";
  if (to > addDays(addYears(from, 1), -1)) return "O intervalo máximo é de 1 ano.";
  return null;
}

/** Todas as datas (YYYY-MM-DD) do período, de até, inclusive. */
export function tacticalPeriodKeys(period: TacticalPeriod): string[] {
  const out: string[] = [];
  const d = startOfDay(period.from);
  const end = startOfDay(period.to);
  while (d <= end) {
    out.push(toBRDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Só dias úteis (seg–sex) — a meta diária é uma meta de dia útil. */
export function tacticalBusinessPeriodKeys(period: TacticalPeriod): string[] {
  return tacticalPeriodKeys(period).filter((k) => {
    const dow = new Date(`${k}T00:00:00`).getDay();
    return dow !== 0 && dow !== 6;
  });
}

export function isSingleDayPeriod(period: TacticalPeriod): boolean {
  return toBRDateKey(period.from) === toBRDateKey(period.to);
}

export function formatTacticalPeriod(period: TacticalPeriod): string {
  const br = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (isSingleDayPeriod(period)) return br(period.to);
  return `${br(period.from)} – ${br(period.to)}`;
}

/**
 * Soma o realizado por usuário e métrica dentro do período.
 *
 * Cada registro de `daily` já é datado pelo dia em que aconteceu, então uma
 * venda entra exatamente uma vez, no dia da produção — nunca se repete nos
 * meses seguintes.
 */
export function buildPeriodValues(daily: DailyDatum[], keys: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of daily) {
    if (!keys.has(d.date)) continue;
    const k = `${d.user_id}|${d.metric_id}`;
    out.set(k, (out.get(k) ?? 0) + (d.value ?? 0));
  }
  return out;
}

/**
 * Meta acumulada do período: soma da meta diária vigente em cada dia útil.
 *
 * As metas são indexadas por métrica uma única vez para que a resolução por
 * dia (pessoa → time → equipe toda, com herança da última meta encerrada)
 * não varra a lista inteira a cada consulta.
 */
export function createPeriodTargetResolver(goals: TacticalGoal[]) {
  const byMetric = new Map<string, TacticalGoal[]>();
  for (const g of goals) {
    const list = byMetric.get(g.metric_id) ?? [];
    list.push(g);
    byMetric.set(g.metric_id, list);
  }
  return (
    metricId: string,
    userId: string | null,
    teamId: string | null,
    keys: string[],
  ): number => {
    const list = byMetric.get(metricId);
    if (!list || !list.length || !keys.length) return 0;
    let sum = 0;
    for (const k of keys) sum += resolveDailyTarget(list, metricId, userId, teamId, k);
    return sum;
  };
}

/** Dias do período (para o texto de apoio abaixo dos filtros). */
export function periodSpanLabel(period: TacticalPeriod): string {
  const all = tacticalPeriodKeys(period);
  const business = tacticalBusinessPeriodKeys(period).length;
  const days = all.length;
  return `${days} ${days === 1 ? "dia" : "dias"} · ${business} ${business === 1 ? "dia útil" : "dias úteis"}`;
}

/** Evita divisão/contagem inválida quando o intervalo é maior que 1 ano. */
export function safeTacticalPeriod(period: TacticalPeriod): TacticalPeriod {
  if (tacticalPeriodError(period)) {
    const to = startOfDay(period.to);
    return { from: to, to };
  }
  return period;
}

/** Diferença em dias entre as duas pontas (inclusive), usada nos textos. */
export function periodDayCount(period: TacticalPeriod): number {
  return differenceInCalendarDays(startOfDay(period.to), startOfDay(period.from)) + 1;
}
