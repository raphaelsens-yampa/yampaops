// Uso do produto (planilha "usage_empresas_AAAA-MM-DD.csv"). Funções puras.

export const USAGE_COLUMNS = [
  "Company ID", "E-mail", "Plano", "Segmento", "Recorrência", "Canal", "IE", "Tier",
  "PQL Score", "PQL Tier", "Módulos", "Usuários", "Pts A", "Pts B", "Pts C", "Última atividade",
] as const;

export type UsageTier = "alto" | "engajado" | "baixo" | "desengajado";
export const USAGE_TIERS: UsageTier[] = ["alto", "engajado", "baixo", "desengajado"];
export const USAGE_TIER_LABEL: Record<string, string> = {
  alto: "Alto", engajado: "Engajado", baixo: "Baixo", desengajado: "Desengajado", sem_dado: "Sem dado",
};
export const PQL_TIER_LABEL: Record<string, string> = {
  pql: "PQL", quase_qualificado: "Quase qualificado", em_desenvolvimento: "Em desenvolvimento", nao_qualificado: "Não qualificado",
};

export type UsageRow = {
  company_id: string; email: string | null; plano: string | null; segmento: string | null;
  recorrencia: string | null; canal: string | null; ie: number | null; tier: string | null;
  pql_score: number | null; pql_tier: string | null; modulos: number | null; usuarios: number | null;
  pts_a: number | null; pts_b: number | null; pts_c: number | null; ultima_atividade: string | null;
};

const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s ? s : null; };
const num = (v: unknown) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n); };

/** "05/11/2026" → "2026-11-05". */
export function parseBrDate(v: unknown): string | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Data de referência a partir do nome do arquivo (usage_empresas_2026-11-06.csv). */
export function referenceDateFromFileName(name: string): string | null {
  return name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

const normHeader = (h: string) =>
  h.replace(/^\uFEFF/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const CANON = new Map<string, string>(USAGE_COLUMNS.map((c) => [normHeader(c), c]));

export function missingColumns(headers: string[]) {
  const set = new Set(headers.map(normHeader));
  return USAGE_COLUMNS.filter((c) => !set.has(normHeader(c)));
}

export function parseUsageRecords(records: Record<string, unknown>[]): UsageRow[] {
  const out: UsageRow[] = [];
  for (const raw of records) {
    const r: Record<string, unknown> = {};
    for (const k of Object.keys(raw)) r[CANON.get(normHeader(k)) ?? k.trim()] = raw[k];
    const company_id = txt(r["Company ID"]);
    if (!company_id) continue;
    const email = txt(r["E-mail"])?.toLowerCase() ?? null;
    out.push({
      company_id, email,
      plano: txt(r["Plano"]), segmento: txt(r["Segmento"]), recorrencia: txt(r["Recorrência"]), canal: txt(r["Canal"]),
      ie: num(r["IE"]), tier: txt(r["Tier"])?.toLowerCase() ?? null,
      pql_score: num(r["PQL Score"]), pql_tier: txt(r["PQL Tier"])?.toLowerCase() ?? null,
      modulos: int(r["Módulos"]), usuarios: int(r["Usuários"]),
      pts_a: int(r["Pts A"]), pts_b: int(r["Pts B"]), pts_c: int(r["Pts C"]),
      ultima_atividade: parseBrDate(r["Última atividade"]),
    });
  }
  return out;
}

/** Um e-mail pode ter várias empresas: fica a de maior IE. */
export function usageByEmail<T extends Pick<UsageRow, "email" | "ie">>(rows: T[]) {
  const map = new Map<string, T>();
  for (const r of rows) {
    if (!r.email) continue;
    const k = r.email.trim().toLowerCase();
    const cur = map.get(k);
    if (!cur || (r.ie ?? -1) > (cur.ie ?? -1)) map.set(k, r);
  }
  return map;
}
