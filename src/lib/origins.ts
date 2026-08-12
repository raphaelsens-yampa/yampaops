/**
 * Recorte por origem do cliente (4blue x Yampa).
 *
 * A única base com origem preenchida hoje é `metas_price_daily`
 * (`origem_cliente` = "yampa" | "4Blue"), disponível a partir de 07/08/2026 e
 * apenas para as classificações novos_pagantes / upsell / downsell / recuperados.
 * Métricas de estoque (Total de MRR, Ativos Pagantes, Churn) não têm quebra por
 * origem e por isso só aparecem na Visão Geral.
 */

export type OriginFilter = "all" | "4blue" | "yampa";

export const ORIGIN_OPTIONS: { value: OriginFilter; label: string }[] = [
  { value: "all", label: "Visão Geral" },
  { value: "4blue", label: "4blue" },
  { value: "yampa", label: "Yampa" },
];

/** Primeira data em que a base marca `origem_cliente`. */
export const ORIGIN_MIN_DATE = "2026-08-07";

export const ORIGIN_UNAVAILABLE_LABEL = "—";
export const ORIGIN_NO_SPLIT_HINT = "Sem recorte por origem na base";
export const ORIGIN_MIN_DATE_HINT = "Origem disponível a partir de 07/08/2026";

export function originLabel(origin: OriginFilter) {
  return ORIGIN_OPTIONS.find((o) => o.value === origin)?.label ?? "Visão Geral";
}

export function isOriginFiltered(origin: OriginFilter): origin is "4blue" | "yampa" {
  return origin === "4blue" || origin === "yampa";
}

/** Compara `origem_cliente` (vem como "yampa" / "4Blue") com o filtro. */
export function matchesOrigin(value: string | null | undefined, origin: OriginFilter) {
  if (!isOriginFiltered(origin)) return true;
  const v = String(value ?? "").trim().toLowerCase();
  return v === origin;
}

/** Classificações de `metas_price_daily` que possuem recorte por origem. */
export type OriginClassification = "novos_pagantes" | "upsell" | "downsell" | "recuperados";

export function normalizeClassificacao(value: string | null | undefined): OriginClassification | null {
  const v = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "novos_pagantes" || v === "novos pagantes") return "novos_pagantes";
  if (v === "upsell") return "upsell";
  if (v === "downsell") return "downsell";
  if (v === "recuperados" || v === "recuperado") return "recuperados";
  return null;
}

/** Categoria (slug em goal_categories) -> classificação com recorte por origem. */
export const CATEGORY_SLUG_TO_CLASSIFICATION: Record<string, OriginClassification> = {
  new_mrr: "novos_pagantes",
  novos_pagantes: "novos_pagantes",
  upsell: "upsell",
  downsell: "downsell",
  recuperados: "recuperados",
  recuperacao_churn: "recuperados",
};

/** Métrica tática -> classificação com recorte por origem. */
export const TACTICAL_METRIC_TO_CLASSIFICATION: Record<string, OriginClassification> = {
  vendas_dia: "novos_pagantes",
  upsell_dia: "upsell",
  recuperados_ft: "recuperados",
};
