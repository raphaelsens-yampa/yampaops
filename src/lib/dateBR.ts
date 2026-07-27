// Parse date strings as Brazil calendar dates (UTC-3), avoiding the JS pitfall
// where `new Date("2026-07-01")` is treated as UTC midnight and shifts to the
// previous day in America/Sao_Paulo. Use this everywhere the DB returns a
// date-only value (DATE columns, YYYY-MM-01 buckets, month keys).
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const DATE_TIME_NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

export function parseDateBR(s: string | Date | null | undefined): Date {
  if (!s) return new Date(NaN);
  if (s instanceof Date) return s;

  const d = DATE_ONLY.exec(s);
  if (d) return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));

  const ym = YEAR_MONTH.exec(s);
  if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, 1);

  const dt = DATE_TIME_NAIVE.exec(s);
  if (dt) {
    return new Date(
      Number(dt[1]), Number(dt[2]) - 1, Number(dt[3]),
      Number(dt[4]), Number(dt[5]), Number(dt[6] || 0),
    );
  }

  // Strings with explicit timezone (Z, +HH:MM, -HH:MM) — safe to parse normally.
  return new Date(s);
}

export function parseDateBRStart(s: string | Date | null | undefined): Date {
  const d = parseDateBR(s);
  if (isNaN(d.getTime())) return d;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDateBREnd(s: string | Date | null | undefined): Date {
  const d = parseDateBR(s);
  if (isNaN(d.getTime())) return d;
  d.setHours(23, 59, 59, 999);
  return d;
}
