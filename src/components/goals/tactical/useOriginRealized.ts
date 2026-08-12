import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toBRDateKey } from "./types";
import {
  isOriginFiltered,
  matchesOrigin,
  normalizeClassificacao,
  ORIGIN_MIN_DATE,
  type OriginClassification,
  type OriginFilter,
} from "@/lib/origins";

export interface OriginValue {
  qtd: number;
  mrr: number;
}

export interface OriginRealized {
  /** `${date}|${classificacao}` -> valor acumulado no mês (MTD) */
  mtd: Map<string, OriginValue>;
  /** `${date}|${classificacao}` -> valor do dia (delta de MTD) */
  daily: Map<string, OriginValue>;
  /** datas (asc) com snapshot disponível no período */
  dates: string[];
  loading: boolean;
}

const EMPTY: OriginRealized = { mtd: new Map(), daily: new Map(), dates: [], loading: false };

interface Row {
  data: string;
  classificacao: string | null;
  origem_cliente: string | null;
  qtd_mtd: number | null;
  mrr_mtd: number | null;
  tipo_snapshot: string | null;
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

export function buildOriginRealized(rows: Row[], origin: OriginFilter) {
  const mtd = new Map<string, OriginValue>();
  const dates = new Set<string>();

  // Um dia pode ter snapshot "parcial" e "fechamento"; agrega por price_id somando.
  for (const r of rows) {
    if (!matchesOrigin(r.origem_cliente, origin)) continue;
    const cls = normalizeClassificacao(r.classificacao);
    if (!cls) continue;
    const key = `${r.data}|${cls}`;
    const prev = mtd.get(key) ?? { qtd: 0, mrr: 0 };
    mtd.set(key, {
      qtd: prev.qtd + Number(r.qtd_mtd || 0),
      mrr: prev.mrr + Number(r.mrr_mtd || 0),
    });
    dates.add(r.data);
  }

  const sortedDates = Array.from(dates).sort();
  const daily = new Map<string, OriginValue>();
  const classes: OriginClassification[] = ["novos_pagantes", "upsell", "downsell", "recuperados"];
  for (const cls of classes) {
    let prevMonth = "";
    let prevQtd = 0;
    let prevMrr = 0;
    for (const date of sortedDates) {
      const cur = mtd.get(`${date}|${cls}`);
      if (!cur) continue;
      const mk = monthKey(date);
      const first = mk !== prevMonth;
      daily.set(`${date}|${cls}`, {
        qtd: first ? cur.qtd : Math.max(cur.qtd - prevQtd, 0),
        mrr: first ? cur.mrr : Math.max(cur.mrr - prevMrr, 0),
      });
      prevMonth = mk;
      prevQtd = cur.qtd;
      prevMrr = cur.mrr;
    }
  }

  return { mtd, daily, dates: sortedDates };
}

/**
 * Lê `metas_price_daily` no período, filtrado por origem do cliente.
 * Retorna vazio quando o filtro está em "Visão Geral".
 */
export function useOriginRealized(
  rangeStart: Date,
  rangeEnd: Date,
  origin: OriginFilter,
  refreshKey = 0,
): OriginRealized {
  const [state, setState] = useState<OriginRealized>(EMPTY);

  useEffect(() => {
    if (!isOriginFiltered(origin)) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      // Começa no 1º dia do mês do início do range para calcular o delta diário.
      const seriesStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      const fromKey = toBRDateKey(seriesStart);
      const from = fromKey < ORIGIN_MIN_DATE ? ORIGIN_MIN_DATE : fromKey;

      const { data } = await supabase
        .from("metas_price_daily")
        .select("data, classificacao, origem_cliente, qtd_mtd, mrr_mtd, tipo_snapshot")
        .gte("data", from)
        .lte("data", toBRDateKey(rangeEnd))
        .not("origem_cliente", "is", null);

      if (cancelled) return;
      const built = buildOriginRealized(((data as any[]) || []) as Row[], origin);
      setState({ ...built, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart.getTime(), rangeEnd.getTime(), origin, refreshKey]);

  return state;
}
