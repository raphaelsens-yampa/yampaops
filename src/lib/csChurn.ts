import type { CsPortfolioRow } from "@/lib/csPortfolio";

export type PortfolioStatus = "ativos" | "churn_recente" | "churn_todos";
export type ChurnRow = CsPortfolioRow & { churned_at?: string | null };

/** Clientes em churn = e-mail sem nenhuma assinatura ativa; mantém a linha inativa mais recente. */
export function churnedClients(active: CsPortfolioRow[], inactive: ChurnRow[]): ChurnRow[] {
  const activeEmails = new Set(active.map((r) => r.email.toLowerCase()));
  const byEmail = new Map<string, ChurnRow>();
  for (const r of inactive) {
    const e = r.email.toLowerCase();
    if (activeEmails.has(e)) continue;
    const prev = byEmail.get(e);
    if (!prev || (r.churned_at || "") > (prev.churned_at || "")) byEmail.set(e, r);
  }
  return [...byEmail.values()].sort((a, b) => (b.churned_at || "").localeCompare(a.churned_at || ""));
}

export function filterByChurnWindow(rows: ChurnRow[], days: number | null, now = new Date()): ChurnRow[] {
  if (days == null) return rows;
  const cutoff = now.getTime() - days * 86400000;
  return rows.filter((r) => r.churned_at && new Date(r.churned_at).getTime() >= cutoff);
}

/** Selo de atualização: atrasado se a base tem mais de 1 dia. */
export function isStale(lastUpdate: string | null, now = new Date()): boolean {
  if (!lastUpdate) return true;
  return now.getTime() - new Date(lastUpdate).getTime() > 26 * 3600000;
}
