import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { stripeConversionOrigin, type OriginFilter } from "@/lib/origins";
import type { PacingEvent } from "@/lib/newMrrPacing";

const spDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Eventos de New MRR (vendas pagas, recuperações não-retidas, upsell positivo) entre duas datas. */
export function useNewMrrPacing(fromDate: string, toDate: string, origin: OriginFilter, refreshKey = 0) {
  const [events, setEvents] = useState<PacingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [conv, rec] = await Promise.all([
        fetchAllPaged<any>(() =>
          supabase
            .from("stripe_conversions")
            .select("id, converted_at, mrr_net, mrr, delta_mrr, is_reactivation, conversion_type, origem_cliente, attribution_source")
            .eq("payment_status", "paid")
            .in("conversion_type", ["new", "upsell"])
            .gte("converted_at", `${fromDate}T03:00:00Z`)
            .lte("converted_at", `${toDate}T23:59:59-03:00`)
            .order("converted_at", { ascending: true })
            .order("id", { ascending: true }) as any,
        ),
        origin === "all"
          ? fetchAllPaged<any>(() =>
              supabase
                .from("tactical_recoveries")
                .select("id, recovered_at, mrr, entry_kind")
                .gte("recovered_at", fromDate)
                .lte("recovered_at", toDate)
                .order("recovered_at", { ascending: true })
                .order("id", { ascending: true }) as any,
            )
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (!alive) return;
      const out: PacingEvent[] = [];
      for (const c of conv.data) {
        if (origin !== "all" && stripeConversionOrigin(c) !== origin) continue;
        const date = spDate(c.converted_at);
        if (c.conversion_type === "upsell") {
          const d = Number(c.delta_mrr ?? 0);
          if (d > 0) out.push({ date, kind: "upsell", mrr: d });
        } else {
          out.push({ date, kind: c.is_reactivation ? "recuperados" : "novos", mrr: Number(c.mrr_net ?? c.mrr ?? 0) });
        }
      }
      for (const r of rec.data) {
        if (r.entry_kind === "retained") continue;
        out.push({ date: String(r.recovered_at).slice(0, 10), kind: "recuperados", mrr: Number(r.mrr ?? 0) });
      }
      setEvents(out);
      setError(conv.error || rec.error);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [fromDate, toDate, origin, refreshKey]);

  return { events, loading, error };
}
