import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDateBR } from "@/lib/dateBR";
import { TacticalMetric, TacticalGoal, DailyDatum, Team, Profile, toBRDateKey } from "./types";
import { normalizeOrigin, type OriginScope, type OriginValue } from "@/lib/originScope";
import { computeOriginDaily } from "@/hooks/useOriginFlows";

/** Vendedores virtuais usados para alocar o realizado que vem da base diária do Metabase */
export const FOURBLUE_USER_ID = "4b100000-0000-4000-8000-000000004b1e";
export const FOURBLUE_CS_USER_ID = "4b100000-0000-4000-8000-00000000c500";


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
  origin: OriginScope = "all",
) {
  const [metrics, setMetrics] = useState<TacticalMetric[]>([]);
  const [goals, setGoals] = useState<TacticalGoal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [daily, setDaily] = useState<DailyDatum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const fromISO = new Date(rangeStart); fromISO.setHours(0, 0, 0, 0);
      const toISO = new Date(rangeEnd); toISO.setHours(23, 59, 59, 999);
      const fromDateStr = toBRDateKey(fromISO);
      const toDateStr = toBRDateKey(toISO);

      const [metricsRes, goalsRes, profilesRes, teamsRes, membersRes, actsRes, convRes, manualRes, recovRes] = await Promise.all([
        supabase.from("tactical_metrics").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("tactical_goals").select("*").lte("period_start", toDateStr).gte("period_end", fromDateStr).order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("teams").select("id, name").order("name"),
        supabase.from("team_members").select("team_id, user_id"),
        supabase.from("activities").select("user_id, type, created_at").gte("created_at", fromISO.toISOString()).lte("created_at", toISO.toISOString()),
        supabase.from("stripe_conversions").select("assigned_seller_id, converted_at, mrr_net, mrr, is_reactivation, stripe_price_id").gte("converted_at", fromISO.toISOString()).lte("converted_at", toISO.toISOString()),
        supabase.from("tactical_manual_entries").select("metric_id, user_id, entry_date, value, mrr_value, entry_kind, origem_cliente").gte("entry_date", fromDateStr).lte("entry_date", toDateStr),
        supabase.from("tactical_recoveries").select("seller_id, recovered_at, mrr, entry_kind, origem_cliente").gte("recovered_at", fromDateStr).lte("recovered_at", toDateStr),
      ]);

      // Mapa price_id → origem (base diária do Metabase). Só necessário quando há recorte.
      const priceOrigin = new Map<string, OriginValue>();
      if (origin !== "all") {
        const { data: origRows } = await supabase
          .from("metas_price_daily")
          .select("stripe_price_id, origem_cliente")
          .not("origem_cliente", "is", null)
          .order("data", { ascending: false })
          .limit(5000);
        for (const r of (origRows as any[]) || []) {
          const o = normalizeOrigin((r as any).origem_cliente);
          const id = String((r as any).stripe_price_id || "").trim();
          if (o && id && id !== "—" && id !== "-" && !priceOrigin.has(id)) priceOrigin.set(id, o);
        }
      }

      /**
       * Origem efetiva de um registro: o que a base diária diz do price_id,
       * o valor declarado no lançamento, ou yampa (padrão da operação própria).
       * O vendedor virtual 4blue sempre conta como 4blue.
       */
      const resolveOrigin = (declared?: string | null, priceId?: string | null, sellerId?: string | null): OriginValue => {
        const fromPrice = priceId ? priceOrigin.get(String(priceId).trim()) : null;
        if (fromPrice) return fromPrice;
        const dec = normalizeOrigin(declared);
        if (dec) return dec;
        if (sellerId === FOURBLUE_USER_ID) return "4blue";
        return "yampa";
      };
      const matchesOrigin = (declared?: string | null, priceId?: string | null, sellerId?: string | null) =>
        origin === "all" || resolveOrigin(declared, priceId, sellerId) === origin;

      if (cancelled) return;

      const metricsData = (metricsRes.data as unknown as TacticalMetric[]) || [];
      setMetrics(metricsData);
      setGoals((goalsRes.data as unknown as TacticalGoal[]) || []);
      const teamsData = (teamsRes.data as Team[]) || [];
      const salesTeamId = teamsData.find((t) => /sales|vendas/i.test(t.name))?.id ?? null;
      const csTeamId = teamsData.find((t) => /^cs$|customer/i.test(t.name))?.id ?? null;

      // Vendedores virtuais da base diária: perfis/vínculos sintéticos (não existem no banco)
      const virtualSales = FOURBLUE_USER_ID;
      const virtualCs = FOURBLUE_CS_USER_ID;
      const virtualProfiles: Profile[] = [
        { user_id: FOURBLUE_USER_ID, full_name: "4blue (base diária)" } as Profile,
        { user_id: FOURBLUE_CS_USER_ID, full_name: "4blue CS (base diária)" } as Profile,
      ];
      const virtualMembers: TeamMember[] = [];
      if (salesTeamId) {
        virtualMembers.push({ team_id: salesTeamId, user_id: FOURBLUE_USER_ID });
      }
      if (csTeamId) {
        virtualMembers.push({ team_id: csTeamId, user_id: FOURBLUE_CS_USER_ID });
      }
      const dbProfiles = (profilesRes.data as Profile[]) || [];
      setProfiles([
        ...dbProfiles,
        ...virtualProfiles.filter((v) => !dbProfiles.some((p) => p.user_id === v.user_id)),
      ]);
      setTeams(teamsData);
      const dbMembers = (membersRes.data as TeamMember[]) || [];
      setMembers([
        ...dbMembers,
        ...virtualMembers.filter(
          (v) => !dbMembers.some((m) => m.team_id === v.team_id && m.user_id === v.user_id),
        ),
      ]);

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

      for (const c of convRes.data || []) {
        const seller = (c as any).assigned_seller_id;
        if (!seller || !(c as any).converted_at) continue;
        if (!matchesOrigin(null, (c as any).stripe_price_id, seller)) continue;
        // Só considera conversão com valor > R$ 0 (líquido quando existir)
        const value = Number((c as any).mrr_net ?? (c as any).mrr ?? 0);
        if (!(value > 0)) continue;
        const d = parseDateBR((c as any).converted_at);
        const key = toBRDateKey(d);
        if (mrrMetric) bump(seller, mrrMetric.id, key, value);
        bump(seller, VIRTUAL_MRR_SALES, key, value);
        if (dealsMetric) bump(seller, dealsMetric.id, key, 1);
        if (reactMetric && (c as any).is_reactivation) bump(seller, reactMetric.id, key, 1);
      }


      // MRR e Vendas do dia vêm 100% do Stripe — lançamento manual não se aplica.
      // Recuperações do CS somam automático (reativação) + manual.
      const lockedIds = new Set(
        metricsData.filter((m) => m.source === "stripe_mrr" || m.source === "stripe_deals").map((m) => m.id)
      );
      const mrrMetricId = mrrMetric?.id;
      const recoveryMetricIds = new Set(
        metricsData
          .filter((m) => m.key === "clientes_recuperados" || m.source === "stripe_reactivation")
          .map((m) => m.id)
      );
      const metricKeyById = new Map(metricsData.map((m) => [m.id, m.key]));
      for (const m of manualRes.data || []) {
        const metricId = (m as any).metric_id;
        if (lockedIds.has(metricId)) continue;
        if (!matchesOrigin((m as any).origem_cliente, null, (m as any).user_id)) continue;
        const retained = (m as any).entry_kind === "retained";
        // Lançamentos de retenção contam na métrica "Clientes retidos"
        const targetMetricId =
          retained && retainedMetric && recoveryMetricIds.has(metricId) ? retainedMetric.id : metricId;
        bump((m as any).user_id, targetMetricId, (m as any).entry_date, Number((m as any).value || 0));
        // MRR recuperado/retido manualmente no CS soma ao MRR do dia
        if (Number((m as any).mrr_value || 0) > 0) {
          const v = Number((m as any).mrr_value || 0);
          if (mrrMetricId) bump((m as any).user_id, mrrMetricId, (m as any).entry_date, v);
          const key = metricKeyById.get(metricId);
          const virtualId =
            key === "upsell_dia"
              ? VIRTUAL_MRR_UPSELL
              : key === "recuperados_ft"
                ? VIRTUAL_MRR_RECOVERED_FT
                : retained
                  ? VIRTUAL_MRR_RETENTION
                  : VIRTUAL_MRR_RECOVERY;
          bump((m as any).user_id, virtualId, (m as any).entry_date, v);
        }
      }


      // Recuperados/retidos lançados ou importados na tabela de recuperações também contam
      for (const r of recovRes.data || []) {
        const seller = (r as any).seller_id;
        const dateKey = String((r as any).recovered_at || "").slice(0, 10);
        if (!seller || !dateKey) continue;
        if (!matchesOrigin((r as any).origem_cliente, null, seller)) continue;
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


      /**
       * Base diária do Metabase (`metas_price_daily`) como fonte do realizado.
       *
       * Regra fundamental: a CLASSIFICAÇÃO define a métrica, a ORIGEM define
       * apenas em qual recorte a linha aparece. Nada entra em Upsell por ser
       * 4blue — só entra o que vem marcado como `classificacao = upsell`.
       *
       * - Upsell e Recuperados FT vêm sempre daqui (não há Stripe/manual para eles).
       * - Vendas novas de yampa continuam vindo do Stripe; da base diária só
       *   entram as vendas novas de origem 4blue (que não passam pelo Stripe).
       */
      {
        const { data: pdRows } = await supabase
          .from("metas_price_daily")
          .select("data, stripe_price_id, classificacao, origem_cliente, qtd_mtd, mrr_mtd")
          .gte("data", fromDateStr)
          .lte("data", toDateStr);
        if (cancelled) return;
        const { days, dailyMrr, dailyQtd } = computeOriginDaily((pdRows as any[]) || []);
        const upsellMetric = metricsData.find((m) => m.key === "upsell_dia");
        const recoveredFtMetric = metricsData.find((m) => m.key === "recuperados_ft");
        Array.from(days).sort().forEach((date) => {
          // Só o pedaço 4blue da base diária entra aqui (yampa vem do Stripe/manual)
          if (origin === "yampa") return;
          const qtd = (slug: string) => dailyQtd.get(`4blue|${slug}|${date}`) || 0;
          const mrr = (slug: string) => dailyMrr.get(`4blue|${slug}|${date}`) || 0;

          const newMrr = mrr("new_mrr");
          if (newMrr) {
            if (mrrMetric) bump(FOURBLUE_USER_ID, mrrMetric.id, date, newMrr);
            bump(FOURBLUE_USER_ID, VIRTUAL_MRR_SALES, date, newMrr);
          }
          const newQtd = qtd("new_mrr");
          if (newQtd && dealsMetric) bump(FOURBLUE_USER_ID, dealsMetric.id, date, newQtd);

          // Recuperados FT (classificacao = recuperados)
          const recMrr = mrr("recuperados");
          if (recMrr) bump(virtualCs, VIRTUAL_MRR_RECOVERED_FT, date, recMrr);
          const recQtd = qtd("recuperados");
          if (recQtd && recoveredFtMetric) bump(virtualCs, recoveredFtMetric.id, date, recQtd);

          // Upsell (classificacao = upsell)
          const upMrr = mrr("upsell");
          if (upMrr) bump(virtualSales, VIRTUAL_MRR_UPSELL, date, upMrr);
          const upQtd = qtd("upsell");
          if (upQtd && upsellMetric) bump(virtualSales, upsellMetric.id, date, upQtd);
        });
      }

      setDaily(Array.from(aggMap.values()));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [rangeStart.getTime(), rangeEnd.getTime(), refreshKey, origin]);

  return { metrics, goals, profiles, teams, members, daily, loading };
}
