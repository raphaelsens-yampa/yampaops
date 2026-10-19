import { addDays, addYears, differenceInCalendarDays, format, startOfDay, startOfMonth, startOfQuarter } from "date-fns";

export type RecoveryPreset = "7" | "30" | "month" | "quarter" | "custom";
export interface RecoveryRange { from: Date; to: Date }
export function recoveryPresetRange(preset: Exclude<RecoveryPreset, "custom">, today: Date): RecoveryRange {
  const to = startOfDay(today);
  const from = preset === "month" ? startOfMonth(to) : preset === "quarter" ? startOfQuarter(to) : addDays(to, -(Number(preset) - 1));
  return { from, to };
}
export function recoveryRangeError(range: RecoveryRange): string | null {
  if (!Number.isFinite(range.from.getTime()) || !Number.isFinite(range.to.getTime())) return "Selecione as duas datas.";
  if (range.from > range.to) return "A data final deve ser igual ou posterior à inicial.";
  if (startOfDay(range.to) > addDays(addYears(startOfDay(range.from), 1), -1)) return "O intervalo máximo é de 1 ano.";
  return null;
}
export function recoveryComparison(range: RecoveryRange) {
  const span = differenceInCalendarDays(range.to, range.from) + 1;
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const dates = Array.from({ length: span }, (_, i) => format(addDays(range.from, i), "yyyy-MM-dd"));
  return { dates, prevFrom, prevTo };
}