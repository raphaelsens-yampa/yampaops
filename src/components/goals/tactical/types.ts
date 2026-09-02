import { adjustedDailyTarget } from "@/lib/revisedGoals";

export type TacticalSource =

  | "activity_type"
  | "stripe_mrr"
  | "stripe_deals"
  | "stripe_reactivation"
  | "ac_stage_move"
  | "manual";


export interface TacticalMetric {
  id: string;
  key: string;
  label: string;
  source: TacticalSource;
  activity_type: string | null;
  unit: "count" | "currency";
  is_active: boolean;
  sort_order: number;
  team_id: string | null;
}

export interface TacticalGoal {
  id: string;
  metric_id: string;
  user_id: string | null;
  team_id: string | null;
  daily_target: number;
  period_start: string;
  period_end: string;
  created_at?: string | null;
}

export interface DailyDatum {
  user_id: string;
  metric_id: string;
  date: string; // YYYY-MM-DD (BR)
  value: number;
}

export interface Team {
  id: string;
  name: string;
}

export interface Profile {
  user_id: string;
  full_name: string | null;
}

export function formatMetric(value: number, unit: "count" | "currency"): string {
  if (unit === "currency") {
    return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  }
  // Contagens podem vir fracionadas (rateio por vendedor / recorte por origem).
  // Sempre exibimos número inteiro para não parecer "milhares" com a vírgula BR.
  return Math.round(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function toBRDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Weekdays (Mon-Fri) between two dates inclusive. */
export function businessDaysBetween(start: Date, end: Date): number {
  let n = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/**
 * Semana vigente cujos dias úteis (seg–sex) já terminaram — caso do sábado/domingo
 * no corte domingo→sábado. Nesses dias a semana já pode ser tratada como fechada
 * para o rebalanceamento das semanas seguintes (relatório de diretoria roda no sábado).
 */
export function weekBusinessDaysDone(weekStart: Date, weekEnd: Date, today: Date): boolean {
  const last = new Date(weekEnd);
  last.setHours(0, 0, 0, 0);
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  while (last >= start) {
    const day = last.getDay();
    if (day !== 0 && day !== 6) break;
    last.setDate(last.getDate() - 1);
  }
  if (last < start) return true; // semana sem dias úteis
  return toBRDateKey(last) < toBRDateKey(today);
}

/**
 * Ritmo diário necessário para fechar o mês na meta (Meta Revisada tática).
 * `realizedBeforeToday` = realizado do mês até o dia anterior.
 */
export function monthPacing(today: Date, dailyTarget: number, realizedBeforeToday: number) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const businessDaysInMonth = businessDaysBetween(start, end);
  const remainingBusinessDays = businessDaysBetween(today, end);
  const adjusted = adjustedDailyTarget({
    dailyTarget,
    realizedBeforeToday,
    businessDaysInMonth,
    remainingBusinessDays,
  });
  return {
    monthTarget: dailyTarget * businessDaysInMonth,
    businessDaysInMonth,
    remainingBusinessDays,
    adjusted,
  };
}

/** Realizado do mês corrente até o dia anterior (exclui hoje). */
export function realizedMonthBeforeToday(
  daily: DailyDatum[],
  metricId: string,
  userIds: string[],
  today: Date,
): number {
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = toBRDateKey(today);
  return daily
    .filter(
      (x) =>
        x.metric_id === metricId &&
        userIds.includes(x.user_id) &&
        x.date.startsWith(monthPrefix) &&
        x.date < todayKey,
    )
    .reduce((s, x) => s + (x.value ?? 0), 0);
}

export interface DailyTargetInfo {
  value: number;
  source: "current" | "inherited" | "none";
  goal?: TacticalGoal;
}

const dateKeyOf = (d: Date | string): string =>
  typeof d === "string" ? d.slice(0, 10) : toBRDateKey(d);

/**
 * Precedência de meta diária: pessoa → time → equipe toda.
 *
 * 1. Vale a meta vigente na data de referência (period_start ≤ data ≤ period_end);
 *    havendo mais de uma no mesmo escopo, vence a de criação mais recente.
 * 2. Não havendo meta vigente em nenhum escopo, herda a última meta anterior
 *    (maior period_end < data), na mesma ordem de precedência.
 * 3. Sem meta anterior → 0.
 */
export function resolveDailyTargetInfo(
  goals: TacticalGoal[],
  metricId: string,
  userId: string | null,
  teamId: string | null,
  refDate?: Date | string,
): DailyTargetInfo {
  const latest = (list: TacticalGoal[]) =>
    list.length
      ? list.reduce((a, b) => (String(b.created_at ?? "") > String(a.created_at ?? "") ? b : a))
      : undefined;
  const latestEnded = (list: TacticalGoal[]) =>
    list.length
      ? list.reduce((a, b) => {
          const ea = String(a.period_end).slice(0, 10);
          const eb = String(b.period_end).slice(0, 10);
          if (eb > ea) return b;
          if (eb < ea) return a;
          return String(b.created_at ?? "") > String(a.created_at ?? "") ? b : a;
        })
      : undefined;

  const scoped = goals.filter((g) => g.metric_id === metricId);
  const inScope = (g: TacticalGoal, scope: "user" | "team" | "all") =>
    scope === "user"
      ? g.user_id === userId
      : scope === "team"
        ? !g.user_id && g.team_id === teamId
        : !g.user_id && !g.team_id;

  const scopes: ("user" | "team" | "all")[] = [
    ...(userId ? (["user"] as const) : []),
    ...(teamId ? (["team"] as const) : []),
    "all",
  ];

  const refKey = refDate ? dateKeyOf(refDate) : undefined;

  // 1) meta vigente
  for (const scope of scopes) {
    const list = scoped.filter(
      (g) =>
        inScope(g, scope) &&
        (!refKey ||
          (String(g.period_start).slice(0, 10) <= refKey &&
            String(g.period_end).slice(0, 10) >= refKey)),
    );
    const hit = latest(list);
    if (hit) return { value: Number(hit.daily_target) || 0, source: "current", goal: hit };
  }

  if (!refKey) return { value: 0, source: "none" };

  // 2) herança da última meta encerrada
  for (const scope of scopes) {
    const list = scoped.filter(
      (g) => inScope(g, scope) && String(g.period_end).slice(0, 10) < refKey,
    );
    const hit = latestEnded(list);
    if (hit) return { value: Number(hit.daily_target) || 0, source: "inherited", goal: hit };
  }

  return { value: 0, source: "none" };
}

export function resolveDailyTarget(
  goals: TacticalGoal[],
  metricId: string,
  userId: string | null,
  teamId: string | null,
  refDate?: Date | string,
): number {
  return resolveDailyTargetInfo(goals, metricId, userId, teamId, refDate).value;
}


/** Métricas visíveis para um time (métrica sem time vale para todos). */
export function metricsForTeam(metrics: TacticalMetric[], teamId: string | null): TacticalMetric[] {
  if (!teamId) return metrics;
  return metrics.filter((m) => !m.team_id || m.team_id === teamId);
}

export function motivationalCopy(pct: number, missing: number, unit: "count" | "currency"): string {
  if (pct >= 150) return "Você está voando hoje 🚀";
  if (pct >= 100) return "Meta batida! Cada ponto a mais é bônus.";
  if (pct >= 75) return `Reta final — falta pouco: ${formatMetric(missing, unit)}.`;
  if (pct >= 40) return "No ritmo certo, mantenha o passo.";
  if (pct > 0) return "Começou bem. Bora acelerar!";
  return "O dia começa agora. Primeiro passo?";
}

export interface MonthWeek {
  index: number;
  start: Date;
  end: Date;
  businessDays: number;
  label: string;
  rangeLabel: string;
}

/**
 * Semanas (domingo a sábado) do mês da data de referência, truncadas nos
 * limites do mês — nunca somam dias de outro mês.
 */
export function weeksOfMonth(ref: Date): MonthWeek[] {
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const weeks: MonthWeek[] = [];
  const cursor = new Date(monthStart);
  let index = 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  while (cursor <= monthEnd) {
    const start = new Date(cursor);
    // sábado encerra a semana (domingo = início)
    const end = new Date(start);
    const daysToSaturday = (6 - start.getDay() + 7) % 7; // 0 = já é sábado
    end.setDate(end.getDate() + daysToSaturday);
    if (end > monthEnd) end.setTime(monthEnd.getTime());
    weeks.push({
      index,
      start,
      end,
      businessDays: businessDaysBetween(start, end),
      label: `S${index}`,
      rangeLabel: `${pad(start.getDate())}–${pad(end.getDate())}/${pad(monthStart.getMonth() + 1)}`,
    });
    cursor.setTime(end.getTime());
    cursor.setDate(cursor.getDate() + 1);
    index++;
  }
  return weeks;
}

/** Soma do realizado (daily) num intervalo de datas, para os usuários dados. */
export function realizedBetween(
  daily: DailyDatum[],
  metricId: string,
  userIds: string[],
  start: Date,
  end: Date,
): number {
  const from = toBRDateKey(start);
  const to = toBRDateKey(end);
  return daily
    .filter(
      (x) =>
        x.metric_id === metricId &&
        (!userIds.length || userIds.includes(x.user_id)) &&
        x.date >= from &&
        x.date <= to,
    )
    .reduce((s, x) => s + (x.value ?? 0), 0);
}

/** "01/08/2026 – 31/08/2026" a partir de datas YYYY-MM-DD. */
export function formatPeriodBR(start: string, end: string): string {
  const br = (s: string) => {
    const [y, m, d] = String(s).slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y}` : String(s);
  };
  return `${br(start)} – ${br(end)}`;
}
