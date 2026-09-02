import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOriginMonthly,
  isOriginFiltered,
  type OriginFilter,
  type OriginMonthlyValue,
  type OriginRpcRow,
} from "@/lib/origins";

/**
 * Realizado MENSAL por origem do cliente (4blue / Yampa).
 *
 * Lê a base canônica cliente-a-cliente (`metas_ativos_pagantes_daily`) através da
 * função `origin_monthly_realized`, que já resolve o snapshot as-of de cada mês,
 * deduplica por empresa e normaliza origem/status/classificação.
 *
 * Retorna um mapa `${YYYY-MM}|${OriginMetric}` -> { mrr, qtd }.
 */
export function useOriginRealized(origin: OriginFilter, year: number, asOf: string) {
  const [rows, setRows] = useState<OriginRpcRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOriginFiltered(origin)) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // O mês anterior a janeiro entra na janela para permitir o cálculo do
      // churn % (base ativa do mês anterior).
      const { data, error } = await (supabase as any).rpc("origin_monthly_realized", {
        p_from: `${year - 1}-12-01`,
        p_to: `${year}-12-31`,
        p_as_of: asOf,
      });
      if (cancelled) return;
      if (error) console.error("origin_monthly_realized:", error.message);
      setRows(((data as OriginRpcRow[]) || []));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, year, asOf]);

  const monthly = useMemo<Map<string, OriginMonthlyValue>>(
    () => buildOriginMonthly(rows, origin),
    [rows, origin],
  );

  return { monthly, loading, hasData: rows.length > 0 };
}
