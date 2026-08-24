/**
 * ===== Cohort de Campanhas =====
 * Helpers para normalização de e-mails, parsing de listas/planilhas,
 * agregação de status e curva de retenção M0..M12.
 */

export type CohortStatus = "active" | "canceled" | "trial" | "never" | "unknown";

export interface CohortContact {
  id: string;
  campaign_id: string;
  email: string;
  email_norm: string;
  name: string | null;
  offer: string | null;
  activated_at: string | null;
}

export interface CohortResult {
  id: string;
  campaign_id: string;
  contact_id: string;
  email_norm: string;
  status: string;
  mrr: number | null;
  plan_name: string | null;
  offer_name: string | null;
  origem_cliente: string | null;
  started_at: string | null;
  canceled_at: string | null;
  churn_type: string | null;
  source: string | null;
  snapshot_date: string | null;
  computed_at: string | null;
}

export interface CohortRow extends CohortContact {
  result: CohortResult | null;
}

export const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  canceled: "Cancelado",
  trial: "Trial",
  never: "Nunca assinou",
  unknown: "Indefinido",
};

export const SOURCE_LABEL: Record<string, string> = {
  metabase: "Metabase",
  stripe: "Stripe",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || !EMAIL_RE.test(s)) return null;
  return s;
}

export interface ParsedContact {
  email: string;
  email_norm: string;
  name: string | null;
  offer: string | null;
  activated_at: string | null;
}

export interface ParseReport {
  contacts: ParsedContact[];
  totalRows: number;
  invalid: number;
  duplicates: number;
}

/** Extrai e-mails de um texto livre (um por linha, vírgula ou ponto e vírgula). */
export function parseEmailList(text: string): ParseReport {
  const tokens = String(text || "")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return buildReport(tokens.map((t) => ({ email: t })), tokens.length);
}

const HEADER_ALIASES: Record<keyof Omit<ParsedContact, "email_norm">, string[]> = {
  email: ["email", "e-mail", "e mail", "mail", "email de ativacao", "email ativacao"],
  name: ["nome", "name", "cliente", "nome do cliente", "empresa"],
  offer: ["oferta", "offer", "plano", "produto", "nome oferta"],
  activated_at: ["data de ativacao", "data ativacao", "ativacao", "data", "activated at", "data_inicio", "data inicio"],
};

function normHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toISODate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (!s) return null;
  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Mapeia linhas de planilha (objetos com cabeçalho) para contatos. */
export function parseSheetRows(rows: Record<string, unknown>[]): ParseReport {
  if (!rows.length) return { contacts: [], totalRows: 0, invalid: 0, duplicates: 0 };
  const headers = Object.keys(rows[0]);
  const pick: Partial<Record<keyof typeof HEADER_ALIASES, string>> = {};
  for (const h of headers) {
    const n = normHeader(h);
    for (const key of Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]) {
      if (pick[key]) continue;
      if (HEADER_ALIASES[key].some((a) => n === a || n.includes(a))) pick[key] = h;
    }
  }
  const raw = rows.map((r) => ({
    email: pick.email ? String(r[pick.email] ?? "") : "",
    name: pick.name ? (String(r[pick.name] ?? "").trim() || null) : null,
    offer: pick.offer ? (String(r[pick.offer] ?? "").trim() || null) : null,
    activated_at: pick.activated_at ? toISODate(r[pick.activated_at]) : null,
  }));
  return buildReport(raw, rows.length);
}

function buildReport(
  raw: { email: string; name?: string | null; offer?: string | null; activated_at?: string | null }[],
  totalRows: number,
): ParseReport {
  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const r of raw) {
    const norm = normalizeEmail(r.email);
    if (!norm) {
      invalid++;
      continue;
    }
    if (seen.has(norm)) {
      duplicates++;
      continue;
    }
    seen.add(norm);
    contacts.push({
      email: String(r.email).trim(),
      email_norm: norm,
      name: r.name ?? null,
      offer: r.offer ?? null,
      activated_at: r.activated_at ?? null,
    });
  }
  return { contacts, totalRows, invalid, duplicates };
}

export interface CohortSummary {
  total: number;
  found: number;
  active: number;
  canceled: number;
  trial: number;
  never: number;
  mrrActive: number;
  mrrLost: number;
  retentionPct: number | null;
  snapshotDate: string | null;
  computedAt: string | null;
}

export function summarize(rows: CohortRow[]): CohortSummary {
  let found = 0;
  let active = 0;
  let canceled = 0;
  let trial = 0;
  let never = 0;
  let mrrActive = 0;
  let mrrLost = 0;
  let snapshotDate: string | null = null;
  let computedAt: string | null = null;

  for (const r of rows) {
    const res = r.result;
    if (!res) {
      never++;
      continue;
    }
    if (res.snapshot_date && (!snapshotDate || res.snapshot_date > snapshotDate)) snapshotDate = res.snapshot_date;
    if (res.computed_at && (!computedAt || res.computed_at > computedAt)) computedAt = res.computed_at;
    const mrr = Number(res.mrr ?? 0);
    switch (res.status) {
      case "active":
        found++;
        active++;
        mrrActive += mrr;
        break;
      case "trial":
        found++;
        trial++;
        break;
      case "canceled":
        found++;
        canceled++;
        mrrLost += mrr;
        break;
      case "never":
        never++;
        break;
      default:
        found++;
    }
  }

  const base = active + canceled;
  return {
    total: rows.length,
    found,
    active,
    canceled,
    trial,
    never,
    mrrActive,
    mrrLost,
    retentionPct: base > 0 ? (active / base) * 100 : null,
    snapshotDate,
    computedAt,
  };
}

export interface CurvePoint {
  month_offset: number;
  active_count: number;
  mrr_total: number;
  retention_pct: number | null;
}

/** Normaliza a curva vinda do banco preenchendo M0..M12 e calculando retenção relativa a M0. */
export function buildCurve(raw: { month_offset: number; active_count: number; mrr_total: number }[]): CurvePoint[] {
  const byOffset = new Map(raw.map((r) => [Number(r.month_offset), r]));
  const m0 = byOffset.get(0)?.active_count ?? 0;
  const maxOffset = raw.length ? Math.max(...raw.map((r) => Number(r.month_offset))) : 0;
  const out: CurvePoint[] = [];
  for (let i = 0; i <= Math.min(12, Math.max(maxOffset, 0)); i++) {
    const r = byOffset.get(i);
    const activeCount = Number(r?.active_count ?? 0);
    out.push({
      month_offset: i,
      active_count: activeCount,
      mrr_total: Number(r?.mrr_total ?? 0),
      retention_pct: m0 > 0 ? (activeCount / m0) * 100 : null,
    });
  }
  return out;
}

export function formatBRL(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatDateBR(v: string | null | undefined): string {
  if (!v) return "—";
  const d = String(v).slice(0, 10).split("-");
  if (d.length !== 3) return "—";
  return `${d[2]}/${d[1]}/${d[0]}`;
}

export function cohortRowsToMatrix(rows: CohortRow[]): (string | number)[][] {
  const out: (string | number)[][] = [
    ["E-mail", "Nome", "Plano", "Oferta", "MRR", "Status", "Ativação", "Cancelamento", "Origem", "Fonte"],
  ];
  for (const r of rows) {
    const res = r.result;
    out.push([
      r.email,
      r.name ?? "",
      res?.plan_name ?? "",
      res?.offer_name ?? r.offer ?? "",
      Number(res?.mrr ?? 0),
      STATUS_LABEL[res?.status ?? "never"] ?? res?.status ?? "",
      r.activated_at ?? res?.started_at ?? "",
      res?.canceled_at ?? "",
      res?.origem_cliente ?? "",
      res?.source ? SOURCE_LABEL[res.source] ?? res.source : "",
    ]);
  }
  return out;
}
