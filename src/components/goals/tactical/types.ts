export interface TacticalMetric {
  id: string;
  key: string;
  label: string;
  source: "activity_type" | "stripe_mrr" | "stripe_deals" | "manual";
  activity_type: string | null;
  unit: "count" | "currency";
  is_active: boolean;
  sort_order: number;
}

export interface TacticalGoal {
  id: string;
  metric_id: string;
  user_id: string | null;
  daily_target: number;
  period_start: string;
  period_end: string;
}

export interface DailyDatum {
  user_id: string;
  metric_id: string;
  date: string; // YYYY-MM-DD (BR)
  value: number;
}

export function formatMetric(value: number, unit: "count" | "currency"): string {
  if (unit === "currency") {
    return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString("pt-BR");
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
