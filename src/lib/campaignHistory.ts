/**
 * ===== Histórico de Campanhas =====
 * Indicadores parametrizáveis por campanha, com Meta x Realizado,
 * % de atingimento e colunas opcionais de funil.
 */

export type MetricUnit = "currency" | "number" | "percent" | "multiple";
export type MetricDirection = "higher" | "lower";

export interface HistoryMetric {
  id: string;
  slug: string;
  label: string;
  unit: string;
  direction: string;
  section: string | null;
  is_funnel: boolean;
  position: number;
  is_active: boolean;
}

export interface HistoryCampaign {
  id: string;
  name: string;
  ref_month: string | null;
  start_date: string | null;
  end_date: string | null;
  channel: string | null;
  notes: string | null;
  theme?: string | null;
  workshop_duration?: string | null;
  main_offer?: string | null;
  downsell_offer?: string | null;
}

export interface HistoryValue {
  id?: string;
  campaign_id: string;
  metric_id: string;
  target_value: number | null;
  actual_value: number | null;
  funnel_target_pct: number | null;
  funnel_actual_pct: number | null;
}

export const UNIT_OPTIONS: { value: MetricUnit; label: string }[] = [
  { value: "currency", label: "Moeda (R$)" },
  { value: "number", label: "Número" },
  { value: "percent", label: "Percentual (%)" },
  { value: "multiple", label: "Multiplicador (x)" },
];

export const DIRECTION_OPTIONS: { value: MetricDirection; label: string }[] = [
  { value: "higher", label: "Maior é melhor" },
  { value: "lower", label: "Menor é melhor" },
];

export const DEFAULT_SECTIONS = ["Investimento e Receita", "Funil", "Resultado"];

/** Converte texto (pt-BR, R$, %, x) em número. */
export function parseNumberBR(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[R$\s%x]/gi, "").replace(/\u00a0/g, "");
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

export function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !isFinite(Number(value))) return "—";
  const n = Number(value);
  switch (unit) {
    case "currency":
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    case "percent":
      return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    case "multiple":
      return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;
    default:
      return n.toLocaleString("pt-BR", { maximumFractionDigits: Number.isInteger(n) ? 0 : 1 });
  }
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

/** % de atingimento = realizado / meta (sempre), independente da direção. */
export function attainmentPct(target: number | null | undefined, actual: number | null | undefined): number | null {
  const t = Number(target || 0);
  const a = Number(actual);
  if (!t || !isFinite(t) || actual === null || actual === undefined || !isFinite(a)) return null;
  return (a / t) * 100;
}

/** Classe de cor conforme faixa de atingimento e direção do indicador. */
export function attainmentClass(pct: number | null, direction: string): string {
  if (pct === null) return "";
  const good = direction === "lower" ? pct <= 100 : pct >= 100;
  const near = direction === "lower" ? pct <= 115 : pct >= 85;
  if (good) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (near) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-destructive/15 text-destructive";
}

/** Variação % entre dois valores, considerando a direção do indicador. */
export function variationPct(from: number | null | undefined, to: number | null | undefined): number | null {
  const a = Number(from);
  const b = Number(to);
  if (!isFinite(a) || !isFinite(b) || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

export function isImprovement(varPct: number | null, direction: string): boolean | null {
  if (varPct === null || varPct === 0) return null;
  return direction === "lower" ? varPct < 0 : varPct > 0;
}

/** Normaliza rótulos para casar nomes de indicadores vindos de planilha. */
export function normalizeLabel(label: string): string {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(label: string): string {
  const base = normalizeLabel(label).replace(/\s+/g, "_");
  return base || `metric_${Date.now()}`;
}

export function campaignLabel(c: HistoryCampaign): string {
  if (!c.ref_month) return c.name;
  const [y, m] = c.ref_month.split("-");
  return `${c.name} · ${m}/${y}`;
}

export function sortCampaigns(list: HistoryCampaign[]): HistoryCampaign[] {
  return [...list].sort((a, b) => (a.ref_month || "").localeCompare(b.ref_month || "") || a.name.localeCompare(b.name));
}

export function groupBySection(metrics: HistoryMetric[]): { section: string; metrics: HistoryMetric[] }[] {
  const out: { section: string; metrics: HistoryMetric[] }[] = [];
  for (const m of [...metrics].sort((a, b) => a.position - b.position)) {
    const section = m.section || "Indicadores";
    const last = out[out.length - 1];
    if (last && last.section === section) last.metrics.push(m);
    else out.push({ section, metrics: [m] });
  }
  return out;
}
