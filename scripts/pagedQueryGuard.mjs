/**
 * Guardrail: qualquer leitura de linhas em tabelas de volume variável precisa
 * usar `fetchAllPaged` (a Data API corta silenciosamente em 1.000 linhas).
 *
 * Exceções aceitas automaticamente:
 *  - contagens no servidor: `count: "exact", head: true`
 *  - leituras de 1 linha: `.maybeSingle()`, `.single()`, `.limit(<=1000)` explícito
 *  - insert/update/upsert/delete/rpc
 * Exceção manual: comentar `// paged-ok: <motivo>` na linha do `.from(...)`
 * ou em até 3 linhas acima.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Tabelas cujo número de linhas cresce sem teto conhecido. */
export const VOLATILE_TABLES = [
  "activities",
  "campaign_cohort_contacts",
  "campaign_cohort_results",
  "chatwoot_contacts",
  "chatwoot_conversation_audits",
  "chatwoot_conversations",
  "chatwoot_csat_responses",
  "chatwoot_messages",
  "commission_clawbacks",
  "commission_conversions",
  "contacts",
  "lead_import_rows",
  "metabase_daily_raw",
  "metas_ativos_pagantes_daily",
  "metas_ativos_pagantes_monthly",
  "metas_churn_daily",
  "metas_snapshot_diario",
  "opportunities",
  "sales_campaign_contacts",
  "stripe_conversions",
];

const FROM_RE = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/g;

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "ui") continue;
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Fatia do arquivo que representa a "cadeia" da query a partir do `.from(...)`. */
function chainAround(source, index) {
  const start = Math.max(0, source.lastIndexOf("\n", Math.max(0, index - 400)));
  let end = index;
  let depth = 0;
  while (end < source.length) {
    const char = source[end];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if ((char === ";" || char === "\n") && depth <= 0 && end > index) break;
    end++;
  }
  return { before: source.slice(start, index), chain: source.slice(index, Math.min(source.length, end + 200)) };
}

export function findViolations(rootDir = "src") {
  const violations = [];
  for (const file of listFiles(rootDir)) {
    const source = readFileSync(file, "utf8");
    const usesPaged = source.includes("fetchAllPaged");
    for (const match of source.matchAll(FROM_RE)) {
      const table = match[1];
      if (!VOLATILE_TABLES.includes(table)) continue;

      const index = match.index ?? 0;
      const line = source.slice(0, index).split("\n").length;
      const { before, chain } = chainAround(source, index);
      const context = before + chain;

      const isMutation = /\.(insert|update|upsert|delete)\s*\(/.test(chain);
      const isCount = /count:\s*["']exact["']/.test(chain) && /head:\s*true/.test(chain);
      const isSingle = /\.(maybeSingle|single)\s*\(/.test(chain);
      const smallLimit = /\.limit\(\s*(\d+)\s*\)/.exec(chain);
      const isSmall = smallLimit ? Number(smallLimit[1]) <= 1000 : false;
      const allowed = /paged-ok/.test(before.split("\n").slice(-4).join("\n")) || /paged-ok/.test(chain.split("\n")[0]);
      const inPagedCall = usesPaged && /fetchAllPaged[\s\S]*$/.test(before) && /fetchAllPaged/.test(before.slice(-400));

      if (isMutation || isCount || isSingle || isSmall || allowed || inPagedCall) continue;
      if (!/\.select\s*\(/.test(chain)) continue;

      violations.push({
        file: path.relative(process.cwd(), file),
        line,
        table,
        message: `Query em "${table}" sem fetchAllPaged (risco de truncamento em 1.000 linhas).`,
      });
    }
  }
  return violations;
}
