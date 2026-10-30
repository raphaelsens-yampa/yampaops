/**
 * Resultado Projetado: base oficial (última foto de ativos pagantes)
 * + operações confirmadas desde a foto até hoje
 * − churn previsto até amanhã (pré-churn do Metabase), exceto clientes
 *   recuperados/retidos ou com novo pagamento confirmado no período.
 */
import type { OriginFilter } from "@/lib/origins";

export type ProjOrigin = "4blue" | "yampa";

export function normOrigin(v: string | null | undefined): ProjOrigin {
  return String(v ?? "").trim().toLowerCase() === "4blue" ? "4blue" : "yampa";
}
export const normEmail = (e: string | null | undefined) => String(e ?? "").trim().toLowerCase();

export interface BaseRow { email: string; mrr: number; origin: ProjOrigin }
export interface OperationRow {
  email: string;
  kind: "new" | "reactivation" | "upsell" | "downgrade" | "recovered" | "retained";
  mrr: number;
  previousMrr: number;
  origin: ProjOrigin;
}
export interface ChurnRow { email: string; mrr: number; origin: ProjOrigin; date: string; tipo: string }
export interface ChurnCase extends ChurnRow { avoided: boolean; avoidedBy?: string }

export interface RecentSale { mrr: number; origin: ProjOrigin }
export const AVG_WINDOW_DAYS = 30;

export interface ProjectedResult {
  mediaVendasMrr: number;
  mediaVendasQtd: number;
  baseMrr: number;
  baseUsers: number;
  vendasMrr: number;
  vendasQtd: number;
  recuperadosMrr: number;
  recuperadosQtd: number;
  upsellMrr: number;
  downsellMrr: number;
  churnMrr: number;
  churnQtd: number;
  avoidedMrr: number;
  avoidedQtd: number;
  projectedMrr: number;
  projectedUsers: number;
  churnCases: ChurnCase[];
}

const inOrigin = (o: ProjOrigin, f: OriginFilter) => f === "all" || o === f;

export function computeProjectedResult(
  base: BaseRow[],
  ops: OperationRow[],
  churn: ChurnRow[],
  origin: OriginFilter,
  recentSales: RecentSale[] = [],
  days = AVG_WINDOW_DAYS,
): ProjectedResult {
  const rs = recentSales.filter((r) => inOrigin(r.origin, origin));
  const mediaVendasMrr = days > 0 ? rs.reduce((s, r) => s + r.mrr, 0) / days : 0;
  const mediaVendasQtd = days > 0 ? Math.round(rs.length / days) : 0;
  const b = base.filter((r) => inOrigin(r.origin, origin));
  const baseEmails = new Set(b.map((r) => r.email));
  const baseMrr = b.reduce((s, r) => s + r.mrr, 0);

  const o = ops.filter((r) => inOrigin(r.origin, origin));
  const savedBy = new Map<string, string>();
  let vendasMrr = 0, vendasQtd = 0, recuperadosMrr = 0, recuperadosQtd = 0, upsellMrr = 0, downsellMrr = 0;
  const reactivated = new Set<string>();
  for (const r of o) {
    if (r.kind === "new") { vendasMrr += r.mrr; vendasQtd += 1; }
    else if (r.kind === "reactivation" || r.kind === "recovered") {
      savedBy.set(r.email, "Recuperado");
      // Recuperação oficial do Metas Táticas: soma todo recuperado (uma vez por cliente)
      if (reactivated.has(r.email)) continue;
      reactivated.add(r.email);
      recuperadosMrr += r.mrr; recuperadosQtd += 1;
    } else if (r.kind === "retained") continue;
    else if (r.kind === "upsell") { upsellMrr += Math.max(0, r.mrr - r.previousMrr); savedBy.set(r.email, savedBy.get(r.email) ?? "Pagamento confirmado"); }
    else if (r.kind === "downgrade") { downsellMrr += Math.max(0, r.previousMrr - r.mrr); savedBy.set(r.email, savedBy.get(r.email) ?? "Pagamento confirmado"); }
  }

  // retenção sempre vence: o cliente sai do churn previsto e aparece como "Retido"
  for (const r of o) if (r.kind === "retained") savedBy.set(r.email, "Retido");

  // um caso por cliente (maior MRR)
  const byEmail = new Map<string, ChurnRow>();
  for (const c of churn.filter((r) => inOrigin(r.origin, origin))) {
    const prev = byEmail.get(c.email);
    if (!prev || c.mrr > prev.mrr) byEmail.set(c.email, c);
  }
  const churnCases: ChurnCase[] = [...byEmail.values()]
    .map((c) => ({ ...c, avoided: savedBy.has(c.email), avoidedBy: savedBy.get(c.email) }))
    .sort((a, b2) => (a.date === b2.date ? b2.mrr - a.mrr : a.date < b2.date ? 1 : -1));
  // recuperados continuam no churn previsto (o MRR volta pela linha de Recuperação);
  // retidos/pagamento confirmado saem do churn
  const lost = churnCases.filter((c) => !c.avoided || c.avoidedBy === "Recuperado");
  const saved = churnCases.filter((c) => c.avoided && c.avoidedBy !== "Recuperado");
  const churnMrr = lost.reduce((s, c) => s + c.mrr, 0);
  const avoidedMrr = saved.reduce((s, c) => s + c.mrr, 0);

  const projectedMrr = baseMrr + vendasMrr + recuperadosMrr + upsellMrr - downsellMrr - churnMrr + mediaVendasMrr;
  const projectedUsers = b.length + vendasQtd + recuperadosQtd - lost.length + mediaVendasQtd;
  return {
    baseMrr, baseUsers: b.length, vendasMrr, vendasQtd, recuperadosMrr, recuperadosQtd,
    upsellMrr, downsellMrr, churnMrr, churnQtd: lost.length, avoidedMrr, avoidedQtd: saved.length,
    projectedMrr, projectedUsers, churnCases, mediaVendasMrr, mediaVendasQtd,
  };
}
