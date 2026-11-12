import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import type { OriginFilter } from "@/lib/origins";
import type { PacingEvent } from "@/lib/newMrrPacing";

const INTERNAL = new Set(["lau.marcelly@gmail.com"]);

/** Origem do cliente no analítico de churn (base Metabase). */
export function churnRowOrigin(row: { origem_cliente?: string | null; is_4blue_customer?: boolean | null }): "yampa" | "4blue" {
  if (row.is_4blue_customer) return "4blue";
  return String(row.origem_cliente || "").toLowerCase().includes("4blue") ? "4blue" : "yampa";
}

/**
 * Eventos de churn (cancelamentos não revertidos) do analítico oficial
 * `metas_churn_daily`, datados por `churn_at`. kind: "voluntario" | "inadimplencia".
 */
export function useChurnPacing(fromDate: string, toDate: string, origin: OriginFilter, refreshKey = 0) {
  const [events, setEvents] = useState<PacingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await fetchAllPaged<any>(() =>
        supabase
          .from("metas_churn_daily")
          .select("id, churn_at, total_mrr, tipo_churn, origem_cliente, is_4blue_customer, email, revertido_em")
          .is("revertido_em", null)
          .gte("churn_at", fromDate)
          .lte("churn_at", toDate)
          .order("churn_at", { ascending: true })
          .order("id", { ascending: true }) as any,
      );
      if (!alive) return;
      const out: PacingEvent[] = [];
      for (const r of res.data) {
        if (INTERNAL.has(String(r.email || "").trim().toLowerCase())) continue;
        if (origin !== "all" && churnRowOrigin(r) !== origin) continue;
        const kind = String(r.tipo_churn || "").toLowerCase().includes("volunt") ? "voluntario" : "inadimplencia";
        out.push({ date: String(r.churn_at).slice(0, 10), kind: kind as any, mrr: Math.max(Number(r.total_mrr || 0), 0) });
      }
      setEvents(out);
      setError(res.error ? String((res.error as any).message ?? res.error) : null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [fromDate, toDate, origin, refreshKey]);

  return { events, loading, error };
}
