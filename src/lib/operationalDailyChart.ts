export type DailyChartInput = { day: string; target: number | null; realized: number | null };
export type DailyChartRow = DailyChartInput & {
  label: string;
  cumTarget: number | null;
  cumRealized: number | null;
  hit: boolean | null;
};

export function isWeekend(day: string): boolean {
  const d = new Date(`${day}T00:00:00`).getDay();
  return d === 0 || d === 6;
}

/** Meta só em dias úteis; acumula meta (todo o mês) e realizado (até o último dia com dado). */
export function buildDailyChartRows(days: DailyChartInput[], lowerIsBetter: boolean): DailyChartRow[] {
  let ct = 0;
  let cr = 0;
  let anyTarget = false;
  return days.map((d) => {
    const target = d.target === null ? null : isWeekend(d.day) ? 0 : d.target;
    if (target !== null) { ct += target; anyTarget = true; }
    if (d.realized !== null) cr += d.realized;
    const hit = d.realized === null || target === null || target === 0
      ? null
      : lowerIsBetter ? d.realized <= target : d.realized >= target;
    return {
      day: d.day,
      label: String(Number(d.day.slice(8, 10))),
      target,
      realized: d.realized,
      cumTarget: anyTarget ? ct : null,
      cumRealized: d.realized === null ? null : cr,
      hit,
    };
  });
}
