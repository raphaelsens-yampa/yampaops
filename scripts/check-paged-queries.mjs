#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { findViolations } from "./pagedQueryGuard.mjs";
import { splitByBaseline } from "./pagedQueryBaseline.mjs";

const baseline = JSON.parse(readFileSync(new URL("./paged-query-baseline.json", import.meta.url), "utf8"));
const { blocking, stale } = splitByBaseline(findViolations("src"), baseline.allow);

for (const entry of stale) {
  console.log(`ℹ Baseline desatualizado (query já corrigida): ${entry}`);
}

if (blocking.length === 0) {
  console.log("✔ Guardrail de paginação: nenhuma query nova de volume variável sem fetchAllPaged.");
  process.exit(0);
}

console.error(`✖ Guardrail de paginação: ${blocking.length} problema(s) novo(s):\n`);
for (const violation of blocking) {
  console.error(`  ${violation.file}:${violation.line} → ${violation.message}`);
}
console.error(
  "\nCorrija usando fetchAllPaged (src/lib/supabasePaged.ts), uma contagem no servidor " +
    '(count: "exact", head: true), .maybeSingle()/.single(), um .limit(<=1000) explícito, ' +
    "ou justifique com um comentário `// paged-ok: <motivo>`. Não adicione entradas no baseline.",
);
process.exit(1);
