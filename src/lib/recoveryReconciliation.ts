/**
 * Conferência das recuperações do CS com a base oficial de ativos pagantes.
 *
 * Uma recuperação só soma MRR oficial quando o cliente NÃO estava na foto de
 * ativos pagantes anterior à data da recuperação. Se já estava, a recuperação
 * apenas preservou a base (fatura recusada que foi paga).
 */
export interface RecoveryInput {
  id: string;
  email: string | null;
  name?: string | null;
  sellerId?: string | null;
  recoveredAt: string; // YYYY-MM-DD
  mrr: number;
}

export type RecoveryStatus = "official" | "preserved";

export interface RecoveryRow extends RecoveryInput {
  status: RecoveryStatus;
  baseDate: string | null;
}

export interface RecoveryReconciliation {
  declared: { qty: number; mrr: number };
  official: { qty: number; mrr: number };
  preserved: { qty: number; mrr: number };
  rows: RecoveryRow[];
}

export const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/**
 * @param baseDateOf data da foto de referência para uma data de recuperação (ou null).
 * @param activeEmailsByDate e-mails ativos (normalizados) por data de foto.
 */
export function classifyRecoveries(
  recoveries: RecoveryInput[],
  baseDateOf: (recoveredAt: string) => string | null,
  activeEmailsByDate: Map<string, Set<string>>,
): RecoveryReconciliation {
  const out: RecoveryReconciliation = {
    declared: { qty: 0, mrr: 0 },
    official: { qty: 0, mrr: 0 },
    preserved: { qty: 0, mrr: 0 },
    rows: [],
  };
  for (const r of recoveries) {
    const mrr = Number(r.mrr) || 0;
    const baseDate = baseDateOf(r.recoveredAt);
    const email = normEmail(r.email);
    const inBase = !!(baseDate && email && activeEmailsByDate.get(baseDate)?.has(email));
    const status: RecoveryStatus = inBase ? "preserved" : "official";
    out.declared.qty++;
    out.declared.mrr += mrr;
    out[status].qty++;
    out[status].mrr += mrr;
    out.rows.push({ ...r, mrr, status, baseDate });
  }
  return out;
}

/** MRR que só preservou a base, somado por vendedor. */
export function preservedBySeller(recon: RecoveryReconciliation | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of recon?.rows ?? []) {
    if (r.status !== "preserved" || !r.sellerId) continue;
    m.set(r.sellerId, (m.get(r.sellerId) ?? 0) + r.mrr);
  }
  return m;
}

/** Foto anterior mais próxima (estritamente antes da recuperação); senão a mais recente disponível. */
export function pickBaseDate(recoveredAt: string, snapshotDates: string[]): string | null {
  const sorted = [...snapshotDates].sort();
  let best: string | null = null;
  for (const d of sorted) if (d < recoveredAt) best = d;
  return best ?? null;
}

/** Alterna um cliente na seleção em lote da conferência de recuperações. */
export function toggleRecoverySelection(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/** Marca (on=true) ou desmarca (on=false) todos os clientes listados. */
export function setAllRecoverySelection(ids: string[], on: boolean): string[] {
  return on ? [...ids] : [];
}

/** Descarta seleções de clientes que saíram da lista (mudança de período/filtro). */
export function pruneRecoverySelection(selected: string[], ids: string[]): string[] {
  const valid = new Set(ids);
  return selected.filter((s) => valid.has(s));
}
