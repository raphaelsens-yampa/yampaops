/**
 * Pacing de New MRR (Novos + Recuperados + Upsell) — funções puras.
 * Datas no formato YYYY-MM-DD (fuso São Paulo já aplicado pelo chamador).
 */
export type PacingKind = "novos" | "recuperados" | "upsell";
export interface PacingEvent { date: string; kind: PacingKind; mrr: number }
export type PacingMetric = "mrr" | "qty";
export type PacingComposition = "total" | PacingKind;

export const roundHalfUp = (n: number) => Math.floor(n + 0.5);

export const isBusinessDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const dayIso = (ym: string, day: number) => `${ym}-${String(day).padStart(2, "0")}`;

const matches = (e: PacingEvent, c: PacingComposition) => c === "total" || e.kind === c;
const valueOf = (e: PacingEvent, metric: PacingMetric) => (metric === "mrr" ? e.mrr : 1);

/** Valor diário (índice 0 = dia 1) de um mês. */
export function dailySeries(events: PacingEvent[], ym: string, metric: PacingMetric, comp: PacingComposition): number[] {
  const out = new Array(daysInMonth(ym)).fill(0);
  for (const e of events) {
    if (!e.date.startsWith(ym) || !matches(e, comp)) continue;
    const d = Number(e.date.slice(8, 10));
    out[d - 1] += valueOf(e, metric);
  }
  return out;
}

export const cumulative = (s: number[]) => {
  let acc = 0;
  return s.map((v) => (acc += v));
};

/** Média diária por dia útil nos `days` dias corridos anteriores a `beforeIso` (exclusivo). */
export function businessDayAverage(events: PacingEvent[], beforeIso: string, days: number, metric: PacingMetric, comp: PacingComposition): number {
  const end = new Date(`${beforeIso}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const startIso = start.toISOString().slice(0, 10);
  let bd = 0;
  for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isBusinessDay(d.toISOString().slice(0, 10))) bd++;
  }
  if (!bd) return 0;
  let sum = 0;
  for (const e of events) if (e.date >= startIso && e.date < beforeIso && matches(e, comp)) sum += valueOf(e, metric);
  return sum / bd;
}

export interface Projection {
  realized: number;
  projected: number;
  pastBusinessDays: number;
  remainingBusinessDays: number;
  dailyPace: number;
}

/**
 * Tendência por dias úteis: realizado + ritmo × dias úteis restantes.
 * `todayDay` conta como passado. Nos 3 primeiros dias úteis o ritmo mistura
 * 50/50 com `fallbackPace` (média recente) para evitar distorções.
 */
export function projectMonth(daily: number[], ym: string, todayDay: number, fallbackPace = 0, paceOverride?: number): Projection {
  const total = daily.length;
  let past = 0, remaining = 0, realized = 0;
  for (let d = 1; d <= total; d++) {
    const bd = isBusinessDay(dayIso(ym, d));
    if (d <= todayDay) { realized += daily[d - 1]; if (bd) past++; }
    else if (bd) remaining++;
  }
  let pace = past ? realized / past : fallbackPace;
  if (past > 0 && past <= 3 && fallbackPace > 0) pace = (pace + fallbackPace) / 2;
  if (paceOverride !== undefined) pace = paceOverride;
  return { realized, projected: realized + pace * remaining, pastBusinessDays: past, remainingBusinessDays: remaining, dailyPace: pace };
}

/** Linha de tendência acumulada: null antes de hoje, cresce por dia útil depois. */
export function trendLine(cum: number[], ym: string, todayDay: number, pace: number): (number | null)[] {
  let acc = cum[todayDay - 1] ?? 0;
  return cum.map((_, i) => {
    const d = i + 1;
    if (d < todayDay) return null;
    if (d === todayDay) return acc;
    if (isBusinessDay(dayIso(ym, d))) acc += pace;
    return acc;
  });
}

/** Ritmo "pessimista": média dos dias úteis passados excluindo os 25% melhores. */
export function pessimisticPace(daily: number[], ym: string, todayDay: number): number {
  const vals: number[] = [];
  for (let d = 1; d <= todayDay; d++) if (isBusinessDay(dayIso(ym, d))) vals.push(daily[d - 1]);
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  const keep = vals.slice(0, Math.max(1, Math.ceil(vals.length * 0.75)));
  return keep.reduce((a, b) => a + b, 0) / keep.length;
}

/** Ritmo dos últimos N dias úteis (até hoje), olhando também o mês anterior. */
export function lastBusinessDaysPace(events: PacingEvent[], todayIso: string, n: number, metric: PacingMetric, comp: PacingComposition): number {
  const days: string[] = [];
  const d = new Date(`${todayIso}T12:00:00Z`);
  while (days.length < n) {
    const iso = d.toISOString().slice(0, 10);
    if (isBusinessDay(iso)) days.push(iso);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const set = new Set(days);
  let sum = 0;
  for (const e of events) if (set.has(e.date) && matches(e, comp)) sum += valueOf(e, metric);
  return sum / n;
}

export const prevMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
