import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { stripeConversionOrigin } from "@/lib/origins";
import { normEmail, normOrigin, type BaseRow, type ChurnRow, type OperationRow, type RecentSale } from "./projectedResultModel";

const spDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

export interface ProjectedData {
  snapshot: string | null;
  today: string;
  tomorrow: string;
  base: BaseRow[];
  ops: OperationRow[];
  churn: ChurnRow[];
  recentSales: RecentSale[];
}

export function useProjectedResult() {
  const [data, setData] = useState<ProjectedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const today = spDate();
      const tomorrow = addDays(today, 1);
      const { data: last, error: e1 } = await supabase
        .from("metas_ativos_pagantes_daily").select("data_snapshot")
        .order("data_snapshot", { ascending: false }).limit(1);
      if (e1) throw e1;
      const snapshot = (last?.[0] as any)?.data_snapshot ?? null;
      const openFrom = snapshot ? addDays(snapshot, 1) : today;

      const avgFrom = addDays(today, -30);
      const [baseRes, convRes, recRes, preRes, avgRes] = await Promise.all([
        snapshot
          ? fetchAllPaged<any>(() => supabase.from("metas_ativos_pagantes_daily")
              .select("id,email,mrr,origem_cliente").eq("data_snapshot", snapshot)
              .eq("status_assinatura", "ativo").order("id"))
          : Promise.resolve({ data: [], error: null }),
        fetchAllPaged<any>(() => supabase.from("stripe_conversions")
          .select("id,customer_email,mrr,previous_mrr,conversion_type,origem_cliente,attribution_source")
          .eq("payment_status", "paid").gte("converted_at", `${openFrom}T03:00:00Z`).order("id")),
        fetchAllPaged<any>(() => supabase.from("tactical_recoveries")
          .select("id,customer_email,mrr,entry_kind,origem_cliente")
          .gte("recovered_at", openFrom).lte("recovered_at", today).order("id")),
        fetchAllPaged<any>(() => (supabase as any).from("metas_pre_churn")
          .select("id,email_norm,mrr,origem_cliente,future_churn_at,tipo,data_ref")
          .gte("future_churn_at", openFrom).lte("future_churn_at", tomorrow).order("id")),
        // média de produção: vendas novas pagas nos 30 dias completos antes de hoje
        fetchAllPaged<any>(() => supabase.from("stripe_conversions")
          .select("id,mrr,conversion_type,origem_cliente,attribution_source")
          .eq("payment_status", "paid").eq("conversion_type", "new")
          .gte("converted_at", `${avgFrom}T03:00:00Z`).lt("converted_at", `${today}T03:00:00Z`).order("id")),
      ]);
      const err = baseRes.error || convRes.error || recRes.error || preRes.error || avgRes.error;
      if (err) throw new Error(err);

      const base: BaseRow[] = baseRes.data.map((r) => ({ email: normEmail(r.email), mrr: Number(r.mrr || 0), origin: normOrigin(r.origem_cliente) }));
      const ops: OperationRow[] = [];
      for (const r of convRes.data) {
        const t = String(r.conversion_type || "").toLowerCase();
        const kind = t === "new" ? "new" : t.startsWith("reactiv") ? "reactivation" : t === "upsell" ? "upsell" : t.startsWith("downgrad") || t === "downsell" ? "downgrade" : null;
        if (!kind) continue;
        ops.push({ email: normEmail(r.customer_email), kind, mrr: Number(r.mrr || 0), previousMrr: Number(r.previous_mrr || 0), origin: stripeConversionOrigin(r) });
      }
      for (const r of recRes.data) {
        const kind = r.entry_kind === "retained" ? "retained" : "recovered";
        ops.push({ email: normEmail(r.customer_email), kind, mrr: Number(r.mrr || 0), previousMrr: 0, origin: normOrigin(r.origem_cliente) });
      }
      // pré-churn repete o cliente por dia de leitura: vale só a leitura mais recente da base
      // (igual ao Metabase oficial); quem sumiu da última leitura já se resolveu
      const latestRef = preRes.data.reduce((m: string, r: any) => (String(r.data_ref) > m ? String(r.data_ref) : m), "");
      const latest = new Map<string, any>();
      for (const r of preRes.data) {
        if (String(r.data_ref) !== latestRef) continue;
        latest.set(`${normEmail(r.email_norm)}|${r.tipo}`, r);
      }
      const churn: ChurnRow[] = [...latest.values()]
        .filter((r) => normEmail(r.email_norm))
        .map((r) => ({ email: normEmail(r.email_norm), mrr: Number(r.mrr || 0), origin: normOrigin(r.origem_cliente), date: String(r.future_churn_at).slice(0, 10), tipo: r.tipo }));

      const recentSales: RecentSale[] = avgRes.data.map((r) => ({ mrr: Number(r.mrr || 0), origin: stripeConversionOrigin(r) }));
      setData({ snapshot, today, tomorrow, base, ops, churn, recentSales });
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return { data, loading, error, reload: load };
}
