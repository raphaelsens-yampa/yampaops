/**
 * Quantidade de vendas (Metas Operacionais · Sales) — funções puras.
 * Meta = meta tática "Vendas do dia" da empresa somada nos dias úteis;
 * Realizado = vendas novas pagas + Recuperados FT (upsell não conta).
 */
import { isBusinessDay, roundHalfUp } from "./newMrrPacing";

export interface SalesGoal { period_start: string; period_end: string; daily_target: number }

/** Meta diária vigente no dia; sem cadastro, herda a última meta anterior. */
export function dailySalesTarget(goals: SalesGoal[], day: string): number | null {
  const covering = goals.filter((g) => g.period_start <= day && g.period_end >= day);
  const pool = covering.length ? covering : goals.filter((g) => g.period_end < day);
  if (!pool.length) return null;
  const best = [...pool].sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];
  return Number(best.daily_target) || 0;
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Soma a meta diária pelos dias úteis do intervalo (inteiro, .5 para cima). */
export function salesTargetForRange(goals: SalesGoal[], from: string, to: string): number | null {
  let total = 0;
  let any = false;
  for (const day of eachDay(from, to)) {
    const t = dailySalesTarget(goals, day);
    if (t === null) continue;
    any = true;
    if (isBusinessDay(day)) total += t;
  }
  return any ? roundHalfUp(total) : null;
}

export interface SaleRow { conversion_type?: string | null; is_reactivation?: boolean | null }
/** Conta como venda: nova paga ou recuperado FT (reativação). */
export function isCountedSale(row: SaleRow): boolean {
  const type = String(row.conversion_type || "").toLowerCase();
  if (type === "upsell" || type === "downgrade") return false;
  return !!row.is_reactivation || type === "new" || !type;
}

export function salesCountForRange(byDay: Map<string, number>, from: string, to: string): number {
  let n = 0;
  for (const [k, v] of byDay) if (k >= from && k <= to) n += v;
  return n;
}
