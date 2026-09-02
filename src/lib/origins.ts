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

/** Chave de participação agregada (todas as classificações) do dia. */
export const ORIGIN_SHARE_ANY = "__any__";

export const EMPTY_ORIGIN_SHARES: OriginShares = { qtd: new Map(), mrr: new Map(), dates: [] };

export function buildOriginShares(rows: OriginShareRow[], origin: OriginFilter): OriginShares {
  if (!isOriginFiltered(origin)) return EMPTY_ORIGIN_SHARES;
  const acc = new Map<string, { oq: number; om: number; tq: number; tm: number }>();
  const dates = new Set<string>();
  for (const r of rows) {
    const cls = normalizeClassificacao(r.classificacao);
    if (!cls || !r.data) continue;
    const q = Math.abs(Number(r.qtd_mtd || 0));
    const m = Math.abs(Number(r.mrr_mtd || 0));
    const isOrigin = matchesOrigin(r.origem_cliente, origin);
    for (const key of [`${r.data}|${cls}`, `${r.data}|${ORIGIN_SHARE_ANY}`]) {
      const cur = acc.get(key) ?? { oq: 0, om: 0, tq: 0, tm: 0 };
      cur.tq += q;
      cur.tm += m;
      if (isOrigin) {
        cur.oq += q;
        cur.om += m;
      }
      acc.set(key, cur);
    }
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
  // Antes da 1ª data com marcação de origem usamos a participação mais antiga
  // conhecida como estimativa. Assim a série histórica não "desaparece" no
  // recorte e 4blue + Yampa continua somando o total geral.
  if (!chosen) {
    for (const d of shares.dates) {
      if (map.has(`${d}|${cls}`)) {
        chosen = d;
        break;
      }
    }
  }
  if (!chosen) {
    // Sem histórico para a classificação: usa a participação agregada do dia.
    if (cls !== (ORIGIN_SHARE_ANY as unknown as OriginClassification)) {
      return originShareAsOf(shares, date, ORIGIN_SHARE_ANY as unknown as OriginClassification, kind);
    }
    return null;
  }
  return map.get(`${chosen}|${cls}`) ?? null;

}

/* ------------------------------------------------------------------ *
 * Recorte MENSAL por origem (Acompanhamento Metas)
 *
 * Fonte canônica: `metas_ativos_pagantes_daily` (cliente a cliente, com
 * `origem_cliente` preenchido desde 31/01/2026), lida via a função
 * `origin_monthly_realized(p_from, p_to, p_as_of)`, que resolve o snapshot
 * as-of de cada mês e devolve qtd/MRR por origem, status e classificação.
 *
 * Diferente do rateio por participação (acima, usado no painel tático diário),
 * aqui o valor é o REAL da origem: 4blue + Yampa = Visão Geral por construção.
 * ------------------------------------------------------------------ */

export type OriginMetric =
  | "total_mrr"
  | "ativos"
  | "novos_pagantes"
  | "recuperados"
  | "upsell"
  | "downsell"
  | "churn_mrr"
  | "churn_qtd"
  | "churn_pct"
  | "net_mrr";

/** Slug da categoria de metas -> métrica com recorte real por origem. */
export const CATEGORY_SLUG_TO_ORIGIN_METRIC: Record<string, OriginMetric> = {
  total_de_mrr_ms3g6o38: "total_mrr",
  usuarios_ativos_pagantes_ms8yyce5: "ativos",
  new_mrr: "novos_pagantes",
  recuperados: "recuperados",
  upsell: "upsell",
  downsell: "downsell",
  "churn-mrr": "churn_mrr",
  "churn-logos": "churn_qtd",
  "churn-rate-logos": "churn_pct",
  "net-mrr": "net_mrr",
};

/** Primeiro mês com origem na base mensal de ativos pagantes. */
export const ORIGIN_MONTHLY_MIN_MONTH = "2026-01";
export const ORIGIN_MONTHLY_MIN_HINT = "Origem disponível a partir de 01/2026";

export interface OriginRpcRow {
  year_month: string;
  origem: string | null;
  status: string | null;
  classificacao: string | null;
  qtd: number | null;
  mrr: number | null;
}

export interface OriginMonthlyValue {
  mrr: number;
  qtd: number;
}

const CLASSIFICATION_TO_METRIC: Record<string, OriginMetric> = {
  "novo pagante": "novos_pagantes",
  novo_pagante: "novos_pagantes",
  novos_pagantes: "novos_pagantes",
  recuperado: "recuperados",
  recuperados: "recuperados",
  upsell: "upsell",
  downsell: "downsell",
};

/**
 * Consolida as linhas da função por mês (`YYYY-MM`) e métrica.
 * Chave do mapa: `${YYYY-MM}|${OriginMetric}`.
 */
export function buildOriginMonthly(
  rows: OriginRpcRow[],
  origin: OriginFilter,
): Map<string, OriginMonthlyValue> {
  const out = new Map<string, OriginMonthlyValue>();
  if (!isOriginFiltered(origin)) return out;
  const add = (month: string, metric: OriginMetric, mrr: number, qtd: number) => {
    const key = `${month}|${metric}`;
    const cur = out.get(key) ?? { mrr: 0, qtd: 0 };
    cur.mrr += mrr;
    cur.qtd += qtd;
    out.set(key, cur);
  };

  for (const r of rows) {
    if (!matchesOrigin(r.origem, origin)) continue;
    const month = String(r.year_month || "").slice(0, 7);
    if (!month) continue;
    const status = String(r.status ?? "").trim().toLowerCase();
    const mrr = Number(r.mrr || 0);
    const qtd = Number(r.qtd || 0);
    if (status === "ativo") {
      add(month, "total_mrr", mrr, qtd);
      add(month, "ativos", mrr, qtd);
      const cls = CLASSIFICATION_TO_METRIC[String(r.classificacao ?? "").trim().toLowerCase()];
      if (cls) add(month, cls, mrr, qtd);
      continue;
    }
    if (status === "cancelado") {
      add(month, "churn_mrr", mrr, qtd);
      add(month, "churn_qtd", mrr, qtd);
    }
    // trial e demais status não entram em nenhuma métrica de meta
  }

  // Derivadas: churn % (sobre a base ativa do mês anterior) e Net MRR.
  const months = Array.from(new Set(Array.from(out.keys()).map((k) => k.split("|")[0]))).sort();
  months.forEach((month, i) => {
    const churnQtd = out.get(`${month}|churn_qtd`)?.qtd ?? 0;
    const prev = i > 0 ? months[i - 1] : null;
    const prevActive = prev ? out.get(`${prev}|ativos`)?.qtd ?? 0 : 0;
    if (prevActive > 0 && out.has(`${month}|churn_qtd`)) {
      const pct = (churnQtd / prevActive) * 100;
      out.set(`${month}|churn_pct`, { mrr: pct, qtd: pct });
    }
    const inc =
      (out.get(`${month}|novos_pagantes`)?.mrr ?? 0) +
      (out.get(`${month}|recuperados`)?.mrr ?? 0) +
      (out.get(`${month}|upsell`)?.mrr ?? 0);
    const dec =
      (out.get(`${month}|churn_mrr`)?.mrr ?? 0) + (out.get(`${month}|downsell`)?.mrr ?? 0);
    if (inc || dec) out.set(`${month}|net_mrr`, { mrr: inc - dec, qtd: 0 });
  });

  return out;
}
