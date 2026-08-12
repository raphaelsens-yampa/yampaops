import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toBRDateKey } from "./types";

/**
 * Regras canônicas do realizado tático (Vendas do Dia / Recuperados FT / Upsell):
 *
 *  - Dia vigente: Stripe (tempo real). Upsell não existe hoje (Metabase é D-1).
 *  - Dias anteriores: Metabase (snapshot D-1), via delta de MTD entre snapshots.
 *  - Override explícito (botão "Forçar Atualização com base Stripe") vence tudo.
 *  - Dia passado sem snapshot do Metabase => realizado 0 com origem "none".
 */

export type RealizedMetricKey = "vendas_dia" | "recuperados_ft" | "upsell_dia";
export type RealizedOrigin = "stripe" | "metabase" | "override" | "none";

export interface RealizedEntry {
  user_id: string;
  metric_key: RealizedMetricKey;
  date: string;
  qtd: number;
  mrr: number;
  origin: RealizedOrigin;
}

export interface StripeDayRow {
  user_id: string;
  date: string;
  mrr: number;
  isReactivation: boolean;
}

export interface MetabaseDayValue {
  qtd: number;
  mrr: number;
}

export interface RealizedSources {
  /** `${date}|${metric_key}` -> valor agregado do Metabase (delta do dia) */
  metabase: Map<string, MetabaseDayValue>;
  /** `${date}|${metric_key}` -> linhas de override por usuário */
  overrides: Map<string, { user_id: string; qtd: number; mrr: number }[]>;
}

/** Sentinela usada quando o Metabase não tem quebra por vendedor e não há Stripe no dia. */
export const METABASE_SENTINEL_USER = "__metabase__";

const CLASSIFICACAO_TO_METRIC: Record<string, RealizedMetricKey> = {
  // tabela dedicada (quebra dos novos pagantes)
  pagante_direto: "vendas_dia",
  conversao: "vendas_dia",
  recuperado: "recuperados_ft",
  // tabela agregada legada (metas_daily)
  novos_pagantes: "vendas_dia",
  recuperados: "recuperados_ft",
  upsell: "upsell_dia",
};

function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

/** Converte séries MTD (acumulado do mês) em valor por dia. */
function mtdToDaily(
  rows: { data: string; classificacao: string; qtd_mtd: number; mrr_mtd: number }[],
): Map<string, MetabaseDayValue> {
  const out = new Map<string, MetabaseDayValue>();
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const c = String(r.classificacao || "").toLowerCase();
    const metric = CLASSIFICACAO_TO_METRIC[c];
    if (!metric) continue;
    const g = `${monthKey(r.data)}|${c}`;
    const list = byGroup.get(g) ?? [];
    list.push(r);
    byGroup.set(g, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => (a.data < b.data ? -1 : 1));
    let prevQtd = 0;
    let prevMrr = 0;
    let first = true;
    for (const r of list) {
      const metric = CLASSIFICACAO_TO_METRIC[String(r.classificacao).toLowerCase()];
      const qtd = Number(r.qtd_mtd || 0);
      const mrr = Number(r.mrr_mtd || 0);
      // O primeiro snapshot do mês representa tudo o que foi acumulado até ele.
      const dQtd = first ? qtd : Math.max(qtd - prevQtd, 0);
      const dMrr = first ? mrr : Math.max(mrr - prevMrr, 0);
      const k = `${r.data}|${metric}`;
      const prev = out.get(k);
      out.set(k, { qtd: (prev?.qtd ?? 0) + dQtd, mrr: (prev?.mrr ?? 0) + dMrr });
      prevQtd = qtd;
      prevMrr = mrr;
      first = false;
    }
  }
  return out;
}

/** Busca Metabase (quebra dedicada + fallback agregado) e overrides do período. */
export async function fetchRealizedSources(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<RealizedSources> {
  // Precisa começar no 1º dia do mês do início do range para calcular o delta.
  const seriesStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const fromKey = toBRDateKey(seriesStart);
  const toKey = toBRDateKey(rangeEnd);

  const [npRes, dailyRes, ovRes] = await Promise.all([
    supabase
      .from("metas_novos_pagantes_daily")
      .select("data, classificacao, qtd_mtd, mrr_mtd")
      .gte("data", fromKey)
      .lte("data", toKey),
    supabase
      .from("metas_daily")
      .select("data, classificacao, qtd_mtd, mrr_mtd")
      .gte("data", fromKey)
      .lte("data", toKey),
    supabase
      .from("tactical_realized_overrides")
      .select("data, metric_key, user_id, qtd, mrr")
      .gte("data", toBRDateKey(rangeStart))
      .lte("data", toKey),
  ]);

  const dedicated = mtdToDaily(((npRes.data as any[]) || []) as any);
  const legacy = mtdToDaily(((dailyRes.data as any[]) || []) as any);

  // A quebra dedicada tem prioridade; o agregado cobre o que ela não tem
  // (inclusive Upsell, que só existe na base agregada).
  const metabase = new Map<string, MetabaseDayValue>(legacy);
  for (const [k, v] of dedicated) metabase.set(k, v);

  const overrides = new Map<string, { user_id: string; qtd: number; mrr: number }[]>();
  for (const r of ((ovRes.data as any[]) || [])) {
    const k = `${r.data}|${r.metric_key}`;
    const list = overrides.get(k) ?? [];
    list.push({
      user_id: r.user_id ?? METABASE_SENTINEL_USER,
      qtd: Number(r.qtd || 0),
      mrr: Number(r.mrr || 0),
    });
    overrides.set(k, list);
  }

  return { metabase, overrides };
}

/** Rateio do total do Metabase entre vendedores conforme a distribuição do Stripe. */
function sellerShares(rows: StripeDayRow[]): Map<string, number> {
  const shares = new Map<string, number>();
  const total = rows.reduce((s, r) => s + (r.mrr || 0), 0);
  if (!rows.length) return shares;
  if (total <= 0) {
    for (const r of rows) shares.set(r.user_id, (shares.get(r.user_id) ?? 0) + 1 / rows.length);
    return shares;
  }
  for (const r of rows) shares.set(r.user_id, (shares.get(r.user_id) ?? 0) + (r.mrr || 0) / total);
  return shares;
}

export interface ResolveArgs {
  sources: RealizedSources;
  /** Conversões do Stripe no período (usadas no dia vigente e para o rateio). */
  stripe: StripeDayRow[];
  dates: string[];
  todayKey: string;
}

export interface ResolveResult {
  entries: RealizedEntry[];
  /** `${date}|${metric_key}` -> origem do dado */
  origins: Map<string, RealizedOrigin>;
}

export function resolveRealized({ sources, stripe, dates, todayKey }: ResolveArgs): ResolveResult {
  const entries: RealizedEntry[] = [];
  const origins = new Map<string, RealizedOrigin>();

  const stripeByDate = new Map<string, StripeDayRow[]>();
  for (const r of stripe) {
    const list = stripeByDate.get(r.date) ?? [];
    list.push(r);
    stripeByDate.set(r.date, list);
  }
  const monthShares = new Map<string, Map<string, number>>();
  for (const [date, rows] of stripeByDate) {
    const mk = monthKey(date);
    const acc = monthShares.get(mk) ?? new Map<string, number>();
    for (const r of rows) acc.set(r.user_id, (acc.get(r.user_id) ?? 0) + (r.mrr || 0));
    monthShares.set(mk, acc);
  }
  const normalizedMonthShares = new Map<string, Map<string, number>>();
  for (const [mk, acc] of monthShares) {
    const total = Array.from(acc.values()).reduce((s, v) => s + v, 0);
    const norm = new Map<string, number>();
    if (total > 0) for (const [u, v] of acc) norm.set(u, v / total);
    normalizedMonthShares.set(mk, norm);
  }

  const metricKeys: RealizedMetricKey[] = ["vendas_dia", "recuperados_ft", "upsell_dia"];

  for (const date of dates) {
    const dayStripe = stripeByDate.get(date) ?? [];
    for (const metric of metricKeys) {
      const k = `${date}|${metric}`;
      const ov = sources.overrides.get(k);
      if (ov?.length) {
        origins.set(k, "override");
        for (const r of ov) {
          entries.push({ user_id: r.user_id, metric_key: metric, date, qtd: r.qtd, mrr: r.mrr, origin: "override" });
        }
        continue;
      }

      if (date === todayKey) {
        if (metric === "upsell_dia") {
          origins.set(k, "none");
          continue;
        }
        const wanted = dayStripe.filter((r) =>
          metric === "recuperados_ft" ? r.isReactivation : !r.isReactivation,
        );
        origins.set(k, "stripe");
        const agg = new Map<string, { qtd: number; mrr: number }>();
        for (const r of wanted) {
          const prev = agg.get(r.user_id) ?? { qtd: 0, mrr: 0 };
          agg.set(r.user_id, { qtd: prev.qtd + 1, mrr: prev.mrr + (r.mrr || 0) });
        }
        for (const [user_id, v] of agg) {
          entries.push({ user_id, metric_key: metric, date, qtd: v.qtd, mrr: v.mrr, origin: "stripe" });
        }
        continue;
      }

      const mb = sources.metabase.get(k);
      if (!mb || (!mb.qtd && !mb.mrr)) {
        origins.set(k, "none");
        continue;
      }
      origins.set(k, "metabase");
      let shares = sellerShares(dayStripe);
      if (!shares.size) shares = normalizedMonthShares.get(monthKey(date)) ?? new Map();
      if (!shares.size) shares = new Map([[METABASE_SENTINEL_USER, 1]]);
      for (const [user_id, share] of shares) {
        entries.push({
          user_id,
          metric_key: metric,
          date,
          qtd: mb.qtd * share,
          mrr: mb.mrr * share,
          origin: "metabase",
        });
      }
    }
  }

  return { entries, origins };
}

/** Hook auxiliar para painéis que precisam apenas das origens/fontes. */
export function useRealizedSources(rangeStart: Date, rangeEnd: Date, refreshKey = 0) {
  const [sources, setSources] = useState<RealizedSources>({
    metabase: new Map(),
    overrides: new Map(),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const s = await fetchRealizedSources(rangeStart, rangeEnd);
      if (cancelled) return;
      setSources(s);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart.getTime(), rangeEnd.getTime(), refreshKey]);

  return { sources, loading };
}
