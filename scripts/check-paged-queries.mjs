#!/usr/bin/env node
import { findViolations } from "./pagedQueryGuard.mjs";

const violations = findViolations("src");

if (violations.length === 0) {
  console.log("✔ Guardrail de paginação: nenhuma query de volume variável sem fetchAllPaged.");
  process.exit(0);
}

console.error(`✖ Guardrail de paginação: ${violations.length} problema(s) encontrado(s):\n`);
for (const violation of violations) {
  console.error(`  ${violation.file}:${violation.line} → ${violation.message}`);
}
console.error(
  "\nCorrija usando fetchAllPaged (src/lib/supabasePaged.ts), uma contagem no servidor " +
    '(count: "exact", head: true), .maybeSingle()/.single(), um .limit(<=1000) explícito, ' +
    "ou justifique com um comentário `// paged-ok: <motivo>`.",
);
process.exit(1);
