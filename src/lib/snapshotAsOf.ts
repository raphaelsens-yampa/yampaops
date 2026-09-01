/**
 * Resolução "as-of" dos snapshots diários (`metas_snapshot_diario`).
 *
 * Regras:
 * 1. Uma linha só vale para o mês que ela descreve se a `data` estiver dentro
 *    desse mês (e até a data de referência). Linhas gravadas depois do fim do
 *    mês — por exemplo um `carry_forward` de 01/08 apontando para 07/2026 —
 *    não podem sobrescrever o fechamento do mês.
 * 2. Havendo linha `fechamento` no mês, ela tem prioridade sobre as demais.
 * 3. Fora isso, vence a maior `data`.
 */
export type SnapshotRowLike = {
  data: string;
  year_month: string;
  metric_key: string;
  scope: string;
  tipo_snapshot?: string | null;
};

/** Último dia (YYYY-MM-DD) do mês descrito por `year_month`. */
export function monthEndKey(yearMonth: string): string {
  const [y, m] = String(yearMonth).slice(0, 7).split("-").map(Number);
  if (!y || !m) return String(yearMonth).slice(0, 10);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function rank<T extends SnapshotRowLike>(row: T): number {
  return row.tipo_snapshot === "fechamento" ? 1 : 0;
}

/** Escolhe, por (mês, métrica, escopo), a linha vigente na data de referência. */
export function resolveSnapshotAsOf<T extends SnapshotRowLike>(rows: T[], refDate: string): T[] {
  const latest = new Map<string, T>();
  for (const r of rows) {
    const cutoff = monthEndKey(r.year_month) < refDate ? monthEndKey(r.year_month) : refDate;
    const day = String(r.data).slice(0, 10);
    if (day > cutoff) continue;
    const key = `${r.year_month}|${r.metric_key}|${r.scope}`;
    const prev = latest.get(key);
    if (!prev) {
      latest.set(key, r);
      continue;
    }
    const better =
      rank(r) > rank(prev) || (rank(r) === rank(prev) && String(prev.data).slice(0, 10) < day);
    if (better) latest.set(key, r);
  }
  return Array.from(latest.values());
}
