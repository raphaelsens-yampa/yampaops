/**
 * Recorte por ORIGEM do cliente (yampa puro vs 4blue).
 *
 * A base diária importada do Metabase (`metas_price_daily`) traz, por dia e por
 * price_id, o campo `origem_cliente` ("yampa" | "4Blue") junto da classificação
 * do movimento e dos acumulados do mês (MTD). É essa base que permite apurar o
 * realizado separado por origem — as metas cadastradas seguem sendo yampa puro.
 */
export type OriginScope = "all" | "yampa" | "4blue";

export type OriginValue = "yampa" | "4blue";

export const ORIGIN_LABELS: Record<OriginScope, string> = {
  all: "Geral",
  yampa: "yampa",
  "4blue": "4blue",
};

export const ORIGIN_SCOPES: OriginScope[] = ["all", "yampa", "4blue"];

/** `4Blue`, `4blue`, `yampa`, `Yampa` → valor canônico. */
export function normalizeOrigin(value?: string | null): OriginValue | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("4blue") || s.includes("4 blue")) return "4blue";
  if (s.includes("yampa")) return "yampa";
  return null;
}

/** classificação da base diária de preços → slug da categoria de meta */
export const CLASSIF_TO_CATEGORY_SLUG: Record<string, string> = {
  novos_pagantes: "new_mrr",
  recuperados: "recuperados",
  upsell: "upsell",
  downsell: "downsell",
};

/** Categorias (slug) que têm quebra por origem hoje */
export const ORIGIN_FLOW_SLUGS = new Set(Object.values(CLASSIF_TO_CATEGORY_SLUG));

export const NO_ORIGIN_BREAKDOWN_NOTE =
  "Sem quebra por origem neste período — a base diária só traz origem para novos pagantes, recuperados, upsell e downsell.";
