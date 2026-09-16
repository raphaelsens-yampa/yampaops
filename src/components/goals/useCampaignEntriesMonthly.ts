import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GrowthCampaignFilter = "all" | "campaign" | "non_campaign";

interface CampaignEntryRow {
  year_month: string;
  customers: number | null;
  mrr: number | null;
  snapshot_date: string | null;
}

/**
 * Entradas de CAMPANHA por mês (clientes que entraram por oferta com cupom
 * marcado como campanha, mais as marcações manuais de divergência).
 *
 * Usado nos cards de "% de Crescimento a.m." para separar a parcela do
 * crescimento do mês que veio de campanha da parcela que não veio.
 */
export function useCampaignEntriesMonthly(year: number, asOf: string, enabled = true) {
  const [rows, setRows] = useState<CampaignEntryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("metabase_campaign_entries_monthly", {
        p_year: year,
        p_as_of: asOf,
      });
      if (cancelled) return;
      if (error) console.error("metabase_campaign_entries_monthly:", error.message);
      setRows(((data as CampaignEntryRow[]) || []));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, asOf, enabled]);

  const { mrrByMonth, ativosByMonth } = useMemo(() => {
    const mrr = new Array(12).fill(0);
    const ativos = new Array(12).fill(0);
    rows.forEach((r) => {
      const idx = Number(String(r.year_month ?? "").slice(5, 7)) - 1;
      if (idx < 0 || idx > 11) return;
      mrr[idx] += Number(r.mrr || 0);
      ativos[idx] += Number(r.customers || 0);
    });
    return { mrrByMonth: mrr, ativosByMonth: ativos };
  }, [rows]);

  return { mrrByMonth, ativosByMonth, loading, hasData: rows.length > 0 };
}
