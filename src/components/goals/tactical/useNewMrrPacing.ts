import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { stripeConversionOrigin, type OriginFilter } from "@/lib/origins";
import { isCampaignConversion, type CampaignContext } from "@/lib/stripeConversions";
import type { PacingEvent } from "@/lib/newMrrPacing";
import { fetchCampaignCouponIds } from "./campaignCoupons";
import { fetchOfficialCsRecoveries, type CsRecovery } from "@/lib/csRecoveries";

/** Origem de uma recuperação: marcação do cliente; sem marcação = Yampa. */
export function recoveryOrigin(r: { origem_cliente?: string | null }): "yampa" | "4blue" {
  return String(r.origem_cliente || "").toLowerCase().includes("4blue") ? "4blue" : "yampa";
}

const spDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Eventos de New MRR (vendas pagas, recuperações do CS que entram de fato na base, upsell positivo) entre duas datas. */
export function useNewMrrPacing(fromDate: string, toDate: string, origin: OriginFilter, refreshKey = 0) {
  const [events, setEvents] = useState<PacingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [conv, rec, couponIds, manualLinks] = await Promise.all([
        fetchAllPaged<any>(() =>
          supabase
            .from("stripe_conversions")
            .select("id, converted_at, customer_email, coupon_id, mrr_net, mrr, delta_mrr, is_reactivation, conversion_type, origem_cliente, attribution_source")
            .eq("payment_status", "paid")
            .gte("converted_at", `${fromDate}T00:00:00-03:00`)
            .lte("converted_at", `${toDate}T23:59:59-03:00`)
            .order("converted_at", { ascending: true })
            .order("id", { ascending: true }) as any,
        ),
        fetchOfficialCsRecoveries(fromDate, toDate).then((data) => ({ data, error: null as string | null })).catch((e) => ({ data: [] as CsRecovery[], error: String(e?.message || e) })),
        fetchCampaignCouponIds(),
        fetchAllPaged<{ email_norm: string; is_campaign: boolean }>(() =>
          supabase.from("tactical_campaign_manual_links").select("email_norm, is_campaign").order("email_norm") as any,
        ),
      ]);
      if (!alive) return;
      const manualByEmail = new Map<string, boolean>();
      for (const link of manualLinks.data || []) {
        const email = String(link.email_norm || "").trim().toLowerCase();
        if (!email) continue;
        manualByEmail.set(email, manualByEmail.get(email) === true ? true : Boolean(link.is_campaign));
      }
      const campaignCtx: CampaignContext = { couponIds, manualByEmail };
      const out: PacingEvent[] = [];
      for (const c of conv.data) {
        if (origin !== "all" && stripeConversionOrigin(c) !== origin) continue;
        const type = String(c.conversion_type || "new").toLowerCase();
        if (type !== "new" && type !== "upsell") continue; // mesma regra de openMonthSalesFromStripe
        const date = spDate(c.converted_at);
        const campaign = isCampaignConversion(c, campaignCtx);
        if (type === "upsell") {
          const d = Number(c.delta_mrr ?? 0);
          if (d > 0) out.push({ date, kind: "upsell", mrr: d, campaign });
        } else {
          out.push({ date, kind: c.is_reactivation ? "recuperados" : "novos", mrr: Number(c.mrr_net ?? c.mrr ?? 0), campaign });
        }
      }
      for (const r of rec.data) {
        if (origin !== "all" && r.origin !== origin) continue;
        const campaign = isCampaignConversion({ coupon_id: null, customer_email: r.email }, campaignCtx);
        out.push({ date: r.day, kind: "recuperados", mrr: r.mrr, campaign });
      }
      setEvents(out);
      setError(conv.error || rec.error || manualLinks.error);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [fromDate, toDate, origin, refreshKey]);

  return { events, loading, error };
}
