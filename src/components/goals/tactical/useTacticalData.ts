import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDateBR } from "@/lib/dateBR";
import { TacticalMetric, TacticalGoal, DailyDatum, Team, Profile, toBRDateKey } from "./types";
import {
  fetchRealizedSources,
  resolveRealized,
  type RealizedOrigin,
  type StripeDayRow,
  type MetabaseDayValue,
} from "./useTacticalRealized";
import {
  buildOriginShares,
  isOriginFiltered,
  originShareAsOf,
  TACTICAL_METRIC_TO_CLASSIFICATION,
  type OriginFilter,
} from "@/lib/origins";

export interface TeamMember { team_id: string; user_id: string; }

// Métricas virtuais (não existem em tactical_metrics)
export const VIRTUAL_MRR_SALES = "virtual_mrr_vendas";
export const VIRTUAL_MRR_RECOVERY = "virtual_mrr_recuperados";
export const VIRTUAL_MRR_RETENTION = "virtual_mrr_retidos";
export const VIRTUAL_MRR_UPSELL = "virtual_mrr_upsell";
export const VIRTUAL_MRR_RECOVERED_FT = "virtual_mrr_recuperados_ft";



export function useTacticalData(
  rangeStart: Date,
  rangeEnd: Date,
  refreshKey: number = 0,
  origin: OriginFilter = "all",
) {
  const [metrics, setMetrics] = useState<TacticalMetric[]>([]);
  const [goals, setGoals] = useState<TacticalGoal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [daily, setDaily] = useState<DailyDatum[]>([]);
  const [origins, setOrigins] = useState<Map<string, RealizedOrigin>>(new Map());
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const fromISO = new Date(rangeStart); fromISO.setHours(0, 0, 0, 0);
      const toISO = new Date(rangeEnd); toISO.setHours(23, 59, 59, 999);
      const fromDateStr = toBRDateKey(fromISO);
      const toDateStr = toBRDateKey(toISO);

      const [metricsRes, goalsRes, profilesRes, teamsRes, membersRes, actsRes, convRes, manualRes, recovRes, sources, originRes, moveCfgRes, ownerMapRes] = await Promise.all([
        supabase.from("tactical_metrics").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("tactical_goals").select("*").lte("period_start", toDateStr).gte("period_end", fromDateStr).order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("teams").select("id, name").order("name"),
        supabase.from("team_members").select("team_id, user_id"),
        supabase.from("activities").select("user_id, type, created_at").gte("created_at", fromISO.toISOString()).lte("created_at", toISO.toISOString()),
        supabase.from("stripe_conversions").select("assigned_seller_id, converted_at, mrr_net, mrr, is_reactivation").gte("converted_at", fromISO.toISOString()).lte("converted_at", toISO.toISOString()),
        supabase.from("tactical_manual_entries").select("metric_id, user_id, entry_date, value, mrr_value, entry_kind").gte("entry_date", fromDateStr).lte("entry_date", toDateStr),
        supabase.from("tactical_recoveries").select("seller_id, recovered_at, mrr, entry_kind").gte("recovered_at", fromDateStr).lte("recovered_at", toDateStr),
        fetchRealizedSources(fromISO, toISO),
        isOriginFiltered(origin)
          ? supabase
              .from("metas_price_daily")
              .select("data, classificacao, origem_cliente, qtd_mtd, mrr_mtd")
              .lte("data", toDateStr)
              .not("origem_cliente", "is", null)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("ac_stage_move_config").select("*").eq("metric_key", "oportunidades_abertas").maybeSingle(),
        supabase.from("ac_owner_seller_map").select("ac_group_id, owner_name, seller_id"),
      ]);



      if (cancelled) return;

      const metricsData = (metricsRes.data as unknown as TacticalMetric[]) || [];
      setMetrics(metricsData);
      setGoals((goalsRes.data as unknown as TacticalGoal[]) || []);
      setProfiles((profilesRes.data as Profile[]) || []);
      setTeams((teamsRes.data as Team[]) || []);
      setMembers((membersRes.data as TeamMember[]) || []);

      const activityMetrics = metricsData.filter((m) => m.source === "activity_type");
      const mrrMetric = metricsData.find((m) => m.source === "stripe_mrr");
      const dealsMetric = metricsData.find((m) => m.source === "stripe_deals");
      const reactMetric = metricsData.find((m) => m.source === "stripe_reactivation");
      const retainedMetric = metricsData.find((m) => m.key === "clientes_retidos");

      const aggMap = new Map<string, DailyDatum>();
      const bump = (user_id: string, metric_id: string, dateKey: string, v: number) => {
        if (!user_id) return;
        const k = `${user_id}|${metric_id}|${dateKey}`;
        const prev = aggMap.get(k);
        if (prev) prev.value += v;
        else aggMap.set(k, { user_id, metric_id, date: dateKey, value: v });
      };

      for (const a of actsRes.data || []) {
        const m = activityMetrics.find((mm) => mm.activity_type === (a as any).type);
        if (!m) continue;
        const d = parseDateBR((a as any).created_at);
        bump((a as any).user_id, m.id, toBRDateKey(d), 1);
      }

      // ---- Realizado canônico: Stripe (hoje) / Metabase (histórico) / Override ----
      const stripeRows: StripeDayRow[] = [];
      for (const c of convRes.data || []) {
        const seller = (c as any).assigned_seller_id;
        if (!seller || !(c as any).converted_at) continue;
        // Só considera conversão com valor > R$ 0 (líquido quando existir)
        const value = Number((c as any).mrr_net ?? (c as any).mrr ?? 0);
        if (!(value > 0)) continue;
        stripeRows.push({
          user_id: seller,
          date: toBRDateKey(parseDateBR((c as any).converted_at)),
          mrr: value,
          isReactivation: Boolean((c as any).is_reactivation),
        });
      }

      const dates: string[] = [];
      for (const d = new Date(fromISO); d <= toISO; d.setDate(d.getDate() + 1)) {
        dates.push(toBRDateKey(d));
      }
      const todayReal = new Date();
      const todayKey = toBRDateKey(todayReal);

      // ---- Recorte por origem (4blue / Yampa) ----
      // O realizado continua vindo das fontes canônicas (Stripe hoje / Metabase
      // no histórico). `metas_price_daily` entra apenas como PARTICIPAÇÃO de
      // cada origem, garantindo 4blue + Yampa = Visão Geral.
      // Exceções (por definição do negócio):
      //  - Realizado do dia vigente / override vem do Stripe => origem Yampa.
      //  - Recuperados/Retidos do CS (manual/importação) => origem Yampa.
      const originFiltered = isOriginFiltered(origin);
      const isYampa = origin === "yampa";
      const includeStripeOrigin = !originFiltered || isYampa;
      const includeManual = !originFiltered || isYampa;
      const shares = originFiltered
        ? buildOriginShares(((originRes as any).data as any[]) || [], origin)
        : null;

      const resolved = resolveRealized({
        sources,
        stripe: stripeRows,
        dates,
        todayKey,
      });


      const mrrMetricId = mrrMetric?.id;
      const upsellMetric = metricsData.find((m) => m.key === "upsell_dia");
      const recoveredFtMetric = metricsData.find((m) => m.key === "recuperados_ft");

      for (const e of resolved.entries) {
        let qtd = e.qtd;
        let mrr = e.mrr;
        const fromStripe = e.origin === "stripe" || e.origin === "override";
        if (shares && !fromStripe) {
          const cls = TACTICAL_METRIC_TO_CLASSIFICATION[e.metric_key];
          if (!cls) continue;
          const sq = originShareAsOf(shares, e.date, cls, "qtd");
          const sm = originShareAsOf(shares, e.date, cls, "mrr");
          if (sq === null || sm === null) continue;
          qtd = qtd * sq;
          mrr = mrr * sm;
        } else if (fromStripe && !includeStripeOrigin) {
          continue;
        }

        if (mrr > 0 && mrrMetricId) bump(e.user_id, mrrMetricId, e.date, mrr);
        if (e.metric_key === "vendas_dia") {
          if (dealsMetric) bump(e.user_id, dealsMetric.id, e.date, qtd);
          if (mrr > 0) bump(e.user_id, VIRTUAL_MRR_SALES, e.date, mrr);
          
        } else if (e.metric_key === "recuperados_ft") {
          if (recoveredFtMetric) bump(e.user_id, recoveredFtMetric.id, e.date, qtd);
          if (mrr > 0) bump(e.user_id, VIRTUAL_MRR_RECOVERED_FT, e.date, mrr);
        } else if (e.metric_key === "upsell_dia") {
          if (upsellMetric) bump(e.user_id, upsellMetric.id, e.date, qtd);
          if (mrr > 0) bump(e.user_id, VIRTUAL_MRR_UPSELL, e.date, mrr);
        }
      }

      // MRR, Vendas do dia, Upsell e Recuperados FT têm fonte canônica
      // (Stripe/Metabase) — lançamento manual não se aplica.
      // Recuperados/Retidos do CS continuam manuais.
      const lockedIds = new Set(
        metricsData
          .filter(
            (m) =>
              m.source === "stripe_mrr" ||
              m.source === "stripe_deals" ||
              m.key === "upsell_dia" ||
              m.key === "recuperados_ft",
          )
          .map((m) => m.id),
      );
      const recoveryMetricIds = new Set(
        metricsData
          .filter((m) => m.key === "clientes_recuperados" || m.source === "stripe_reactivation")
          .map((m) => m.id)
      );
      // Lançamentos manuais (CS) são da base Yampa: entram em Geral e Yampa.
      for (const m of includeManual ? manualRes.data || [] : []) {
        const metricId = (m as any).metric_id;
        if (lockedIds.has(metricId)) continue;
        const retained = (m as any).entry_kind === "retained";
        // Lançamentos de retenção contam na métrica "Clientes retidos"
        const targetMetricId =
          retained && retainedMetric && recoveryMetricIds.has(metricId) ? retainedMetric.id : metricId;
        bump((m as any).user_id, targetMetricId, (m as any).entry_date, Number((m as any).value || 0));
        // MRR recuperado/retido manualmente no CS soma ao MRR do dia
        if (Number((m as any).mrr_value || 0) > 0) {
          const v = Number((m as any).mrr_value || 0);
          if (mrrMetricId) bump((m as any).user_id, mrrMetricId, (m as any).entry_date, v);
          bump(
            (m as any).user_id,
            retained ? VIRTUAL_MRR_RETENTION : VIRTUAL_MRR_RECOVERY,
            (m as any).entry_date,
            v,
          );
        }
      }


      // Recuperados/retidos lançados ou importados na tabela de recuperações também contam
      for (const r of includeManual ? recovRes.data || [] : []) {
        const seller = (r as any).seller_id;
        const dateKey = String((r as any).recovered_at || "").slice(0, 10);
        if (!seller || !dateKey) continue;
        const retained = (r as any).entry_kind === "retained";
        if (retained) {
          if (retainedMetric) bump(seller, retainedMetric.id, dateKey, 1);
        } else if (reactMetric) {
          bump(seller, reactMetric.id, dateKey, 1);
        }
        const mrr = Number((r as any).mrr || 0);
        if (mrr > 0) {
          if (mrrMetricId) bump(seller, mrrMetricId, dateKey, mrr);
          bump(seller, retained ? VIRTUAL_MRR_RETENTION : VIRTUAL_MRR_RECOVERY, dateKey, mrr);
        }
      }


      setDaily(Array.from(aggMap.values()));
      setOrigins(resolved.origins);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [rangeStart.getTime(), rangeEnd.getTime(), refreshKey, origin]);

  return { metrics, goals, profiles, teams, members, daily, origins, loading };
}
