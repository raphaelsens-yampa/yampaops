import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLASSIF_TO_CATEGORY_SLUG,
  normalizeOrigin,
  type OriginScope,
  type OriginValue,
} from "@/lib/originScope";

/** `Novos Pagantes` / `novos_pagantes` → `novos_pagantes` */
function normalizeClassif(v?: string | null) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

export interface OriginFlows {
  loading: boolean;
  /** price_id → origem do cliente (última leitura disponível) */
  priceOrigin: Map<string, OriginValue>;
  /** dias (YYYY-MM-DD) em que a base diária trouxe quebra por origem */
  days: Set<string>;
  /** MRR do dia por origem/categoria no intervalo (null = sem quebra no período) */
  sumMrr: (origin: OriginScope, slug: string, fromKey: string, toKey: string) => number | null;
  /** Quantidade do dia por origem/categoria no intervalo */
  sumQtd: (origin: OriginScope, slug: string, fromKey: string, toKey: string) => number | null;
  /** Origem de uma conversão do Stripe a partir do price_id */
  originOfPrice: (priceId?: string | null) => OriginValue | null;
  /** Slugs com quebra por origem disponível */
  availableSlugs: Set<string>;
}

export interface OriginDailyMaps {
  priceOrigin: Map<string, OriginValue>;
  days: Set<string>;
  /** dias disponíveis por recorte ("all" inclui dias sem quebra de origem) */
  daysByOrigin: Map<OriginScope, Set<string>>;
  availableSlugs: Set<string>;
  /** `${origin}|${slug}|${date}` → MRR do dia */
  dailyMrr: Map<string, number>;
  /** `${origin}|${slug}|${date}` → quantidade do dia */
  dailyQtd: Map<string, number>;
}

/**
 * Converte as linhas MTD de `metas_price_daily` em valores DIÁRIOS por
 * origem e categoria (o valor do dia é o delta do acumulado dentro do mês).
 *
 * Importante: o recorte "all" (Geral) é acumulado como uma série própria que
 * inclui também as linhas SEM `origem_cliente` (dias anteriores ao início da
 * quebra por origem). Somar yampa + 4blue duplicaria o valor no dia em que a
 * quebra começa, porque nesse dia o MTD por origem já traz o mês inteiro.
 */
export function computeOriginDaily(rows: any[]): OriginDailyMaps {
  const priceOrigin = new Map<string, OriginValue>();
  const days = new Set<string>();
  const daysByOrigin = new Map<OriginScope, Set<string>>([
    ["all", new Set<string>()],
    ["yampa", new Set<string>()],
    ["4blue", new Set<string>()],
  ]);
  const availableSlugs = new Set<string>();
  const mtdMrr = new Map<string, number>();
  const mtdQtd = new Map<string, number>();
  const datesBySeries = new Map<string, Set<string>>();

  for (const r of rows || []) {
    const origin = normalizeOrigin(r.origem_cliente);
    const slug = CLASSIF_TO_CATEGORY_SLUG[normalizeClassif(r.classificacao)];
    if (!slug) continue;
    const date = String(r.data);
    days.add(date);
    availableSlugs.add(slug);
    const priceId = String(r.stripe_price_id || "").trim();
    if (origin && priceId && priceId !== "\u2014" && priceId !== "-") priceOrigin.set(priceId, origin);

    // "all" sempre acumula (com ou sem origem); as séries por origem só quando há origem
    const scopes: OriginScope[] = origin ? ["all", origin] : ["all"];
    for (const scope of scopes) {
      daysByOrigin.get(scope)!.add(date);
      const series = `${scope}|${slug}`;
      const key = `${series}|${date}`;
      mtdMrr.set(key, (mtdMrr.get(key) || 0) + Number(r.mrr_mtd || 0));
      mtdQtd.set(key, (mtdQtd.get(key) || 0) + Number(r.qtd_mtd || 0));
      const set = datesBySeries.get(series) || new Set<string>();
      set.add(date);
      datesBySeries.set(series, set);
    }
  }

  const dailyMrr = new Map<string, number>();
  const dailyQtd = new Map<string, number>();
  datesBySeries.forEach((set, series) => {
    const dates = Array.from(set).sort();
    dates.forEach((date, i) => {
      const prev = i > 0 ? dates[i - 1] : null;
      const sameMonth = prev && prev.slice(0, 7) === date.slice(0, 7);
      const prevMrr = sameMonth ? mtdMrr.get(`${series}|${prev}`) || 0 : 0;
      const prevQtd = sameMonth ? mtdQtd.get(`${series}|${prev}`) || 0 : 0;
      dailyMrr.set(`${series}|${date}`, (mtdMrr.get(`${series}|${date}`) || 0) - prevMrr);
      dailyQtd.set(`${series}|${date}`, (mtdQtd.get(`${series}|${date}`) || 0) - prevQtd);
    });
  });

  return { priceOrigin, days, daysByOrigin, availableSlugs, dailyMrr, dailyQtd };
}


/**
 * Deriva o realizado diário por ORIGEM a partir de `metas_price_daily`.
 *
 * A base é acumulada no mês (MTD) por price_id, então o valor do dia é a
 * diferença em relação ao último dia disponível DENTRO do mesmo mês.
 */
export function useOriginFlows(fromKey: string | null, toKey: string, refreshKey = 0): OriginFlows {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fromKey || !toKey) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("metas_price_daily")
        .select("data, stripe_price_id, classificacao, origem_cliente, qtd_mtd, mrr_mtd")
        .gte("data", fromKey)
        .lte("data", toKey)
        .order("data", { ascending: true });
      if (cancelled) return;
      setRows((data as any[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromKey, toKey, refreshKey]);

  return useMemo(() => {
    const { priceOrigin, days, daysByOrigin, availableSlugs, dailyMrr, dailyQtd } =
      computeOriginDaily(rows);

    const sumFrom = (map: Map<string, number>) =>
      (origin: OriginScope, slug: string, from: string, to: string) => {
        // cada recorte tem sua própria cobertura de dias ("all" cobre também
        // os dias anteriores ao início da quebra por origem)
        const scopeDays = daysByOrigin.get(origin) ?? new Set<string>();
        const dayList = Array.from(scopeDays).filter((d) => d >= from && d <= to);
        if (!dayList.length) return null;
        let total = 0;
        for (const d of dayList) total += map.get(`${origin}|${slug}|${d}`) || 0;
        return total;
      };

    return {
      loading,
      priceOrigin,
      days,
      daysByOrigin,
      availableSlugs,
      sumMrr: sumFrom(dailyMrr),
      sumQtd: sumFrom(dailyQtd),

      originOfPrice: (priceId?: string | null) => {
        const id = String(priceId || "").trim();
        if (!id) return null;
        return priceOrigin.get(id) || null;
      },
    };
  }, [rows, loading]);
}
