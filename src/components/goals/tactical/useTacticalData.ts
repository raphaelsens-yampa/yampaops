import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDateBR } from "@/lib/dateBR";
import { TacticalMetric, TacticalGoal, DailyDatum, Team, Profile, toBRDateKey } from "./types";

export interface TeamMember { team_id: string; user_id: string; }

export function useTacticalData(rangeStart: Date, rangeEnd: Date, refreshKey: number = 0) {
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

      const [metricsRes, goalsRes, profilesRes, teamsRes, membersRes, actsRes, convRes, manualRes] = await Promise.all([
        supabase.from("tactical_metrics").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("tactical_goals").select("*").lte("period_start", toDateStr).gte("period_end", fromDateStr),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("teams").select("id, name").order("name"),
        supabase.from("team_members").select("team_id, user_id"),
        supabase.from("activities").select("user_id, type, created_at").gte("created_at", fromISO.toISOString()).lte("created_at", toISO.toISOString()),
        supabase.from("stripe_conversions").select("assigned_seller_id, converted_at, mrr_net, mrr, is_reactivation").gte("converted_at", fromISO.toISOString()).lte("converted_at", toISO.toISOString()),
        supabase.from("tactical_manual_entries").select("metric_id, user_id, entry_date, value").gte("entry_date", fromDateStr).lte("entry_date", toDateStr),
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
        const d = parseDateBR((c as any).converted_at);
        const key = toBRDateKey(d);
        if (mrrMetric) bump(seller, mrrMetric.id, key, Number((c as any).mrr_net ?? (c as any).mrr ?? 0));
        if (dealsMetric) bump(seller, dealsMetric.id, key, 1);
        if (reactMetric && (c as any).is_reactivation) bump(seller, reactMetric.id, key, 1);
      }

      // MRR e Vendas do dia vêm 100% do Stripe — lançamento manual não se aplica.
      // Recuperações do CS somam automático (reativação) + manual.
      const lockedIds = new Set(
        metricsData.filter((m) => m.source === "stripe_mrr" || m.source === "stripe_deals").map((m) => m.id)
      );
      for (const m of manualRes.data || []) {
        if (lockedIds.has((m as any).metric_id)) continue;
        bump((m as any).user_id, (m as any).metric_id, (m as any).entry_date, Number((m as any).value || 0));
      }

      setDaily(Array.from(aggMap.values()));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [rangeStart.getTime(), rangeEnd.getTime(), refreshKey]);

  return { metrics, goals, profiles, teams, members, daily, loading };
}
