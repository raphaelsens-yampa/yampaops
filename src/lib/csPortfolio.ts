/**
 * Carteira de CS Low-touch — tipos, regras de segmentação e cálculos de cadência.
 * Timezone de referência: America/Sao_Paulo.
 */

export type RuleOp =
  | "eq" | "neq" | "contains" | "in" | "not_in"
  | "gte" | "lte" | "gt" | "lt" | "is_null" | "not_null";

export interface SegmentRule {
  field: string;
  op: RuleOp;
  value?: unknown;
}

export interface CsSegment {
  id: string;
  name: string;
  color: string;
  cadence_days: number;
  rules: SegmentRule[];
  priority: number;
  is_active: boolean;
}

export interface CsAssignmentRule {
  id: string;
  segment_id: string;
  mode: "fixed" | "round_robin";
  cs_user_ids: string[];
  position: number;
  is_active: boolean;
}

export interface CsPortfolioRow {
  id: string;
  email: string;
  company_name: string | null;
  cs_user_id: string | null;
  segment_id: string | null;
  assignment_source: string;
  plano: string | null;
  nome_oferta: string | null;
  mrr: number;
  previous_mrr: number | null;
  origem_cliente: string | null;
  recorrencia_pagamento: string | null;
  data_inicio: string | null;
  tenure_days: number | null;
  industry: string | null;
  engagement_score: number | null;
  engagement_band: string | null;
  churn_risk_score: number | null;
  conversations_90d: number;
  last_client_message_at: string | null;
  last_contact_at: string | null;
  next_contact_due: string | null;
  cadence_days: number | null;
  is_active: boolean;
}

export interface CsContactLog {
  id: string;
  portfolio_id: string;
  email: string;
  author_id: string;
  contacted_at: string;
  channel: string;
  outcome: string;
  note: string | null;
  chatwoot_conversation_id: number | null;
}

export const RULE_FIELDS: { key: string; label: string; kind: "text" | "number" }[] = [
  { key: "plano", label: "Plano", kind: "text" },
  { key: "nome_oferta", label: "Oferta", kind: "text" },
  { key: "mrr", label: "MRR", kind: "number" },
  { key: "origem_cliente", label: "Origem", kind: "text" },
  { key: "recorrencia_pagamento", label: "Recorrência", kind: "text" },
  { key: "gateway", label: "Gateway", kind: "text" },
  { key: "tenure_days", label: "Tempo de casa (dias)", kind: "number" },
  { key: "area", label: "Área (Mapa de Preços)", kind: "text" },
  { key: "industry", label: "Ramo de atuação", kind: "text" },
  { key: "engagement_score", label: "Índice de engajamento", kind: "number" },
  { key: "engagement_band", label: "Faixa de engajamento", kind: "text" },
];

export const RULE_OPS: { key: RuleOp; label: string; needsValue: boolean; list?: boolean }[] = [
  { key: "eq", label: "é igual a", needsValue: true },
  { key: "neq", label: "é diferente de", needsValue: true },
  { key: "contains", label: "contém", needsValue: true },
  { key: "in", label: "está em (lista)", needsValue: true, list: true },
  { key: "not_in", label: "não está em (lista)", needsValue: true, list: true },
  { key: "gte", label: "maior ou igual a", needsValue: true },
  { key: "lte", label: "menor ou igual a", needsValue: true },
  { key: "gt", label: "maior que", needsValue: true },
  { key: "lt", label: "menor que", needsValue: true },
  { key: "is_null", label: "está vazio", needsValue: false },
  { key: "not_null", label: "está preenchido", needsValue: false },
];

export const CONTACT_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "E-mail" },
  { key: "call", label: "Ligação" },
  { key: "reuniao", label: "Reunião" },
  { key: "outro", label: "Outro" },
];

export const CONTACT_OUTCOMES = [
  { key: "respondeu", label: "Respondeu" },
  { key: "sem_resposta", label: "Sem resposta" },
  { key: "agendou", label: "Agendou reunião" },
  { key: "risco", label: "Sinal de risco" },
  { key: "resolvido", label: "Demanda resolvida" },
];

export type CadenceStatus = "nunca" | "vencido" | "vence_breve" | "em_dia";

export const CADENCE_LABEL: Record<CadenceStatus, string> = {
  nunca: "Nunca atendido",
  vencido: "Vencido",
  vence_breve: "Vence em breve",
  em_dia: "Em dia",
};

/** Data de hoje (America/Sao_Paulo) no formato YYYY-MM-DD. */
export function todaySP(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function diffDays(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86_400_000);
}

/**
 * Status de cadência do cliente. `vence_breve` cobre os próximos 7 dias.
 */
export function cadenceStatus(row: CsPortfolioRow, today = todaySP()): CadenceStatus {
  if (!row.last_contact_at) return "nunca";
  if (!row.next_contact_due) return "em_dia";
  const d = diffDays(row.next_contact_due, today);
  if (d < 0) return "vencido";
  if (d <= 7) return "vence_breve";
  return "em_dia";
}

/** Dias de atraso (0 quando não está vencido). */
export function daysOverdue(row: CsPortfolioRow, today = todaySP()): number {
  if (!row.next_contact_due) return row.last_contact_at ? 0 : 999;
  const d = diffDays(today, row.next_contact_due);
  return d > 0 ? d : 0;
}

/**
 * Prioridade da fila do dia: atraso × risco × MRR.
 * Quanto maior, mais urgente.
 */
export function queuePriority(row: CsPortfolioRow, today = todaySP()): number {
  const overdue = Math.min(daysOverdue(row, today), 180) / 180;
  const risk = row.churn_risk_score != null ? Math.min(row.churn_risk_score, 100) / 100 : 0.4;
  const mrr = Math.min(row.mrr, 1000) / 1000;
  const never = row.last_contact_at ? 0 : 0.25;
  return Number((overdue * 0.45 + risk * 0.3 + mrr * 0.2 + never).toFixed(4));
}

export function fmtBRL(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00Z` : v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export const ENGAGEMENT_LABEL: Record<string, string> = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
  silencioso: "Silencioso",
};
