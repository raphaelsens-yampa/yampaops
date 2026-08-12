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
  recuperacao_ft: "recuperados",
  vendas_do_dia: "novos_pagantes",
};


/** Métrica tática -> classificação com recorte por origem. */
export const TACTICAL_METRIC_TO_CLASSIFICATION: Record<string, OriginClassification> = {
  vendas_dia: "novos_pagantes",
  upsell_dia: "upsell",
  recuperados_ft: "recuperados",
};

/* ------------------------------------------------------------------ *
 * Recorte por PARTICIPAÇÃO (share)
 *
 * `metas_price_daily` é uma base independente das fontes canônicas de
 * realizado (`metas_daily` / `metas_novos_pagantes_daily` / Stripe) e tem
 * totais em outra ordem de grandeza. Usá-la diretamente como realizado
 * fazia o recorte por origem ficar MAIOR que a Visão Geral.
 *
 * Por isso ela é usada apenas para calcular a PARTICIPAÇÃO de cada origem
 * (origem / total) por dia e classificação. Essa participação é aplicada
 * sobre o realizado canônico, garantindo que 4blue + Yampa = Visão Geral e
 * que cada recorte seja sempre menor ou igual ao total.
 * ------------------------------------------------------------------ */

export interface OriginShareRow {
  data: string;
  classificacao: string | null;
  origem_cliente: string | null;
  qtd_mtd: number | null;
  mrr_mtd: number | null;
}

export interface OriginShares {
  /** `${date}|${cls}` -> participação (0..1) em quantidade */
  qtd: Map<string, number>;
  /** `${date}|${cls}` -> participação (0..1) em MRR */
  mrr: Map<string, number>;
  /** datas (asc) com snapshot disponível */
  dates: string[];
}

export const EMPTY_ORIGIN_SHARES: OriginShares = { qtd: new Map(), mrr: new Map(), dates: [] };

export function buildOriginShares(rows: OriginShareRow[], origin: OriginFilter): OriginShares {
  if (!isOriginFiltered(origin)) return EMPTY_ORIGIN_SHARES;
  const acc = new Map<string, { oq: number; om: number; tq: number; tm: number }>();
  const dates = new Set<string>();
  for (const r of rows) {
    const cls = normalizeClassificacao(r.classificacao);
    if (!cls || !r.data) continue;
    const k = `${r.data}|${cls}`;
    const cur = acc.get(k) ?? { oq: 0, om: 0, tq: 0, tm: 0 };
    const q = Math.abs(Number(r.qtd_mtd || 0));
    const m = Math.abs(Number(r.mrr_mtd || 0));
    cur.tq += q;
    cur.tm += m;
    if (matchesOrigin(r.origem_cliente, origin)) {
      cur.oq += q;
      cur.om += m;
    }
    acc.set(k, cur);
    dates.add(r.data);
  }
  const qtd = new Map<string, number>();
  const mrr = new Map<string, number>();
  for (const [k, v] of acc) {
    qtd.set(k, v.tq > 0 ? Math.min(v.oq / v.tq, 1) : 0);
    mrr.set(k, v.tm > 0 ? Math.min(v.om / v.tm, 1) : 0);
  }
  return { qtd, mrr, dates: Array.from(dates).sort() };
}

/** Participação as-of a data (último snapshot <= data; antes disso usa o 1º disponível). */
export function originShareAsOf(
  shares: OriginShares,
  date: string,
  cls: OriginClassification,
  kind: "qtd" | "mrr",
): number | null {
  if (!shares.dates.length) return null;
  const map = kind === "qtd" ? shares.qtd : shares.mrr;
  let chosen: string | null = null;
  for (const d of shares.dates) {
    if (d > date) break;
    if (map.has(`${d}|${cls}`)) chosen = d;
  }
  if (!chosen) {
    // Antes da 1ª data com marcação de origem, usa a participação mais antiga conhecida.
    chosen = shares.dates.find((d) => map.has(`${d}|${cls}`)) ?? null;
  }
  if (!chosen) return null;
  return map.get(`${chosen}|${cls}`) ?? null;
}
