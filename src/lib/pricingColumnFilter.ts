/**
 * Column filter for the pricing services table.
 * Supports text "contains" (case-insensitive) and numeric comparisons
 * like ">500", "<=30", "=3" against the numeric value of the column.
 */
export function matchesColumnFilter(raw: string, display: string, numeric?: number): boolean {
  const q = raw.trim();
  if (!q) return true;
  const m = q.match(/^(>=|<=|>|<|=)\s*(-?[\d.,]+)$/);
  if (m && numeric !== undefined) {
    const n = parseFloat(m[2].replace(/\./g, '').replace(',', '.'));
    if (isNaN(n)) return true;
    switch (m[1]) {
      case '>': return numeric > n;
      case '<': return numeric < n;
      case '>=': return numeric >= n;
      case '<=': return numeric <= n;
      default: return Math.abs(numeric - n) < 0.005;
    }
  }
  return display.toLowerCase().includes(q.toLowerCase());
}
