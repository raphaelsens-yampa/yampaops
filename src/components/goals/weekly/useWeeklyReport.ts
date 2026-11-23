import { useQuery } from "@tanstack/react-query";
import { fetchOfficialCsRecoveries } from "@/lib/csRecoveries";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { dayKeySP } from "@/lib/stripeConversions";
import { stripeConversionOrigin, type OriginFilter } from "@/lib/origins";
import {
  addDays, avgSummaries, businessDays, monthBounds, pace, rankBy, shiftWeek, summarizeChurn, summarizeSales,
  type ChurnRow, type SaleRow, type WeekRange,
} from "@/lib/weeklyReport";

const AREA_LABEL: Record<string, string> = { sales: "Sales", cs: "CS", product: "Produto", produto: "Produto", parceria: "Parceria", marketing: "Marketing" };

export function useWeeklyReport(week: WeekRange, origin: OriginFilter) {
  return useQuery({
    queryKey: ["weekly-report", week.start, origin],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const today = dayKeySP(new Date());
      // Mês do report até hoje (mesma régua das Metas); semanas de meses fechados usam o fim da semana.
      const refDay = week.end < `${today.slice(0, 7)}-01` ? week.end : today;
      const month = monthBounds(refDay);
      const from = [addDays(week.start, -28), month.start].sort()[0];
      const to = week.end > month.end ? week.end : month.end;

      const [cats, sales, churn, goals, snap, pre, projs, deals, profiles, csRecs, notes] = await Promise.all([
        supabase.from("goal_categories").select("id,slug"),
        fetchAllPaged<any>(() => supabase.from("stripe_conversions")
          .select("id,converted_at,conversion_type,is_reactivation,mrr,mrr_net,delta_mrr,area,assigned_seller_id,origem_cliente,attribution_source,coupon_id")
          .eq("payment_status", "paid").gte("converted_at", `${from}T00:00:00-03:00`).lt("converted_at", `${addDays(to, 1)}T00:00:00-03:00`).order("id")),
        fetchAllPaged<any>(() => supabase.from("metas_churn_daily").select("id,churn_at,total_mrr,company_id,origem_cliente")
          .is("revertido_em", null).gte("churn_at", from).lte("churn_at", `${to}T23:59:59`).order("id")),
        supabase.from("goals").select("target_mrr,target_deals,origem_cliente,user_id,team_id,period_start,period_end,category_id")
          .lte("period_start", month.end).gte("period_end", month.start).is("user_id", null).is("team_id", null),
        supabase.from("metas_snapshot_diario").select("data,metric_key,realized_amount,origem_cliente")
          .in("metric_key", ["total_mrr", "ativos_pagantes"]).is("origem_cliente", null).lte("data", refDay).order("data", { ascending: false }).limit(4),
        fetchAllPaged<any>(() => supabase.from("metas_pre_churn").select("id,email_norm,tipo,mrr,future_churn_at,origem_cliente")
          .gte("future_churn_at", today).lte("future_churn_at", addDays(today, 7)).order("id")),
        supabase.from("campaign_projections").select("name,start_date,end_date,mrr,qty").eq("year_month", `${refDay.slice(0, 7)}-01`),
        fetchAllPaged<any>(() => supabase.from("ac_funnel_deals").select("ac_deal_id,status,value,closed_at,deal_created_at").eq("crm_source", "rd").order("ac_deal_id")),
        supabase.from("profiles").select("user_id,full_name"),
        fetchOfficialCsRecoveries(from, to),
        supabase.from("weekly_report_notes").select("*").eq("week_start", week.start).maybeSingle(),
      ]);
      for (const r of [sales, churn, pre, deals]) if (r.error) throw new Error(r.error);
      for (const r of [cats, goals, snap, projs, profiles, notes] as any[]) if (r.error) throw r.error;

      const saleRows: SaleRow[] = sales.data.map((r) => ({ ...r, day: dayKeySP(new Date(r.converted_at)) }));
      const churnRows: ChurnRow[] = churn.data.map((r) => ({ day: String(r.churn_at).slice(0, 10), mrr: Number(r.total_mrr || 0), company: String(r.company_id), origem_cliente: r.origem_cliente }));

      const slugOf = Object.fromEntries((cats.data || []).map((c: any) => [c.id, c.slug]));
      const mtd = { start: month.start, end: refDay };
      const g = (slug: string) => (goals.data || []).filter((x: any) => slugOf[x.category_id] === slug && (origin === "all" ? !x.origem_cliente : String(x.origem_cliente || "").toLowerCase() === origin));
      const gMrr = (slug: string) => g(slug).reduce((a: number, x: any) => a + Number(x.target_mrr || 0), 0);
      const elapsed = businessDays(month.start, refDay), total = businessDays(month.start, month.end);
      const mSales = summarizeSales(saleRows, mtd, origin, csRecs);
      const mChurn = summarizeChurn(churnRows, mtd, origin);
      const snapOf = (k: string) => (snap.data || []).find((x: any) => x.metric_key === k);

      const weekSales = summarizeSales(saleRows, week, origin, csRecs);
      const prevWeek = shiftWeek(week, -1);
      const prevSales = summarizeSales(saleRows, prevWeek, origin, csRecs);
      const avg4 = avgSummaries([1, 2, 3, 4].map((i) => summarizeSales(saleRows, shiftWeek(week, -i), origin, csRecs)));
      const weekChurn = summarizeChurn(churnRows, week, origin);
      const prevChurn = summarizeChurn(churnRows, prevWeek, origin);
      const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i)).map((day) => {
        const s = summarizeSales(saleRows, { start: day, end: day }, origin, csRecs);
        const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
        const goalDay = wd === 0 || wd === 6 ? 0 : (gMrr("new_mrr") + gMrr("recuperados") + gMrr("upsell")) / (total || 1);
        return { day, realized: s.newMrr, goal: goalDay, qty: s.qty };
      });

      const names = Object.fromEntries((profiles.data || []).map((p: any) => [p.user_id, p.full_name]));
      const filtered = saleRows.filter((r) => origin === "all" || stripeConversionOrigin(r) === origin);
      const sellerKey = (r: SaleRow) => (r.assigned_seller_id ? names[r.assigned_seller_id] || "Vendedor" : "Sem vendedor");
      const csF = csRecs.filter((c) => origin === "all" || c.origin === origin);
      const csSeller = csF.map((c) => ({ day: c.day, mrr: c.mrr, key: c.sellerId ? names[c.sellerId] || "Vendedor" : "Sem vendedor" }));
      const csArea = csF.map((c) => ({ day: c.day, mrr: c.mrr, key: "CS" }));
      const areaKey = (r: SaleRow) => AREA_LABEL[String(r.area || "").toLowerCase()] || (r.area || "Outros");

      const preSeen = new Set<string>();
      const preRows = (pre.data || []).filter((r: any) => {
        if (origin !== "all" && String(r.origem_cliente || "").toLowerCase() !== origin) return false;
        const k = `${r.email_norm}|${r.tipo}|${r.future_churn_at}`; if (preSeen.has(k)) return false; preSeen.add(k); return true;
      });
      const campaignRealized = summarizeSales(saleRows.filter((r: any) => !!r.coupon_id), mtd, origin);
      const inWeek = (s?: string | null) => !!s && s.slice(0, 10) >= week.start && s.slice(0, 10) <= week.end;

      return {
        week, prevWeek, refDay, month, generatedAt: new Date().toISOString(),
        snapshotDate: snapOf("total_mrr")?.data ?? null,
        monthly: {
          totalMrr: { goal: gMrr("total_de_mrr_ms3g6o38"), realized: Number(snapOf("total_mrr")?.realized_amount || 0) },
          ativos: { goal: g("usuarios_ativos_pagantes_ms8yyce5").reduce((a: number, x: any) => a + Number(x.target_deals || 0), 0), realized: Math.round(Number(snapOf("ativos_pagantes")?.realized_amount || 0)) },
          newMrr: pace(gMrr("new_mrr") + gMrr("recuperados") + gMrr("upsell"), mSales.newMrr, elapsed, total),
          novos: pace(gMrr("new_mrr"), mSales.novos, elapsed, total),
          recuperados: pace(gMrr("recuperados"), mSales.recuperados, elapsed, total),
          upsell: pace(gMrr("upsell"), mSales.upsell, elapsed, total),
          churn: pace(gMrr("churn-mrr"), mChurn.mrr, elapsed, total),
          net: mSales.newMrr - mChurn.mrr, netGoal: gMrr("net-mrr"),
          qty: mSales.qty, churnLogos: mChurn.logos,
          elapsed, total,
        },
        weekly: { cur: weekSales, prev: prevSales, avg4, churn: weekChurn, prevChurn, days },
        sellers: { week: rankBy(filtered, sellerKey, week, csSeller), month: rankBy(filtered, sellerKey, mtd, csSeller) },
        areas: { week: rankBy(filtered, areaKey, week, csArea), month: rankBy(filtered, areaKey, mtd, csArea) },
        campaigns: { projections: projs.data || [], realized: campaignRealized, nonCampaign: mSales.newMrr - campaignRealized.newMrr },
        risks: {
          preChurnMrr: preRows.reduce((a: number, r: any) => a + Number(r.mrr || 0), 0), preChurnCount: preRows.length,
          projectedNet: pace(1, mSales.newMrr, elapsed, total).trend - pace(1, mChurn.mrr, elapsed, total).trend,
          rdOpen: deals.data.filter((d: any) => String(d.status) === "0").length,
          rdOpenValue: deals.data.filter((d: any) => String(d.status) === "0").reduce((a: number, d: any) => a + Number(d.value || 0), 0),
          rdWonWeek: deals.data.filter((d: any) => String(d.status) === "1" && inWeek(d.closed_at)).length,
          rdNewWeek: deals.data.filter((d: any) => inWeek(d.deal_created_at)).length,
        },
        notes: notes.data as { highlights: string; risks: string; actions: string } | null,
      };
    },
  });
}
export type WeeklyReport = NonNullable<ReturnType<typeof useWeeklyReport>["data"]>;
