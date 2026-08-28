/** Separa violações já conhecidas (baseline) das novas, que devem quebrar o build. */
export function splitByBaseline(violations, allow = []) {
  const allowed = new Set(allow);
  const seen = new Set();
  const blocking = [];

  for (const violation of violations) {
    const key = `${violation.file}|${violation.table}`;
    seen.add(key);
    if (!allowed.has(key)) blocking.push(violation);
  }

  const stale = allow.filter((key) => !seen.has(key));
  return { blocking, stale };
}
