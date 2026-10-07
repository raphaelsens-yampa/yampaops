export interface ChurnCase {
  id: string;
  company_id: number;
  email: string | null;
  phone: string | null;
  tipo: "voluntario" | "involuntario" | "outro";
  motivo: string | null;
  descricao: string | null;
  plano: string | null;
  segmento: string | null;
  origem_cliente: string | null;
  mrr: number;
  data_ref: string;
  data_pedido: string | null;
  final_vigencia: string | null;
  future_churn_at: string | null;
  dias_atraso: number | null;
  inicio_vigencia: string | null;
  desfecho: "em_risco" | "revertido" | "churn";
  mrr_atual: number | null;
  cs_user_id: string | null;
  cs_name: string | null;
  industry: string | null;
  engagement_band: string | null;
  tenure_days: number | null;
  recuperado_em: string | null;
  recovery_channel: string | null;
}

export const TIPO_LABEL: Record<string, string> = {
  voluntario: "Voluntário (pedido de cancelamento)",
  involuntario: "Involuntário (inadimplência)",
  outro: "Sem tipo (histórico antigo)",
};
export const DESFECHO_LABEL: Record<string, string> = {
  em_risco: "Em risco",
  revertido: "Revertido",
  churn: "Churn",
};

export interface GroupStat {
  key: string;
  total: number;
  mrr: number;
  revertidos: number;
  churn: number;
  emRisco: number;
  mrrChurn: number;
  /** Revertidos ÷ casos encerrados (revertido + churn). */
  reversaoPct: number | null;
}

export function groupStats(rows: ChurnCase[], keyOf: (r: ChurnCase) => string | null | undefined): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const r of rows) {
    const key = (keyOf(r) || "Não informado").toString();
    const g = map.get(key) || { key, total: 0, mrr: 0, revertidos: 0, churn: 0, emRisco: 0, mrrChurn: 0, reversaoPct: null };
    g.total++;
    g.mrr += Number(r.mrr || 0);
    if (r.desfecho === "revertido") g.revertidos++;
    else if (r.desfecho === "churn") { g.churn++; g.mrrChurn += Number(r.mrr || 0); }
    else g.emRisco++;
    map.set(key, g);
  }
  for (const g of map.values()) {
    const closed = g.revertidos + g.churn;
    g.reversaoPct = closed ? (g.revertidos / closed) * 100 : null;
  }
  return [...map.values()].sort((a, b) => b.mrr - a.mrr);
}

export function tenureBand(days: number | null, inicio: string | null, ref: string): string {
  let d = days;
  if (d == null && inicio) d = Math.round((new Date(ref).getTime() - new Date(inicio).getTime()) / 86400000);
  if (d == null) return "Não informado";
  if (d < 90) return "0–3 meses";
  if (d < 180) return "3–6 meses";
  if (d < 365) return "6–12 meses";
  return "12+ meses";
}

/** Dias até virar churn (involuntário = 14 dias do vencimento; voluntário = fim da vigência). */
export function daysToChurn(r: ChurnCase, today: string): number | null {
  const limit = r.future_churn_at || r.final_vigencia;
  if (!limit) return null;
  return Math.round((new Date(limit).getTime() - new Date(today).getTime()) / 86400000);
}

/** Fila: em risco, ordenado por prazo (mais urgente) e depois MRR. */
export function riskQueue(rows: ChurnCase[], today: string): (ChurnCase & { dias: number | null })[] {
  return rows
    .filter((r) => r.desfecho === "em_risco")
    .map((r) => ({ ...r, dias: daysToChurn(r, today) }))
    .sort((a, b) => (a.dias ?? 999) - (b.dias ?? 999) || b.mrr - a.mrr);
}
