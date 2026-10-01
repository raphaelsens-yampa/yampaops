import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { useGrowthBaselines } from "@/hooks/useGrowthBaselines";
import {
  addMonths,
  averageChurnMrr,
  monthKeyOf,
  newMrrFromConversions,
  type RealizedMonth,
} from "@/lib/commercialPlan";

export interface CommercialPlanMonthRow {
  id: string;
  year_month: string;
  target_new_mrr: number | null;
  target_churn_mrr: number | null;
  target_deals: number | null;
  target_ativos: number | null;
  notes: string | null;
  is_locked: boolean | null;
}

export interface QuotaRow {
  id: string;
  year_month: string;
  seller_id: string;
  quota_new_mrr: number | null;
  quota_deals: number | null;
  weight: number | null;
  is_manual: boolean | null;
  notes: string | null;
}

export interface SellerLite {
  id: string;
  name: string;
}

export interface FunnelKpiMonth {
  yearMonth: string;
  winRate: number | null;
  avgTicket: number | null;
}

const REALIZED_METRICS = new Set(["new_mrr", "churn_mrr", "net_mrr", "total_mrr", "ativos_pagantes"]);

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/**
 * Fontes de dados do Planejamento Comercial: realizado oficial mensal
 * (metabase_monthly_agg), base de crescimento, cadastro do plano, quotas e
 * taxas de conversão dos Funis CRM.
 */
export function useCommercialPlan() {
  const [loading, setLoading] = useState(true);
  const [realized, setRealized] = useState<RealizedMonth[]>([]);
  const [overrides, setOverrides] = useState<CommercialPlanMonthRow[]>([]);
  const [sellers, setSellers] = useState<SellerLite[]>([]);
  const [sellerHistory, setSellerHistory] = useState<Record<string, number>>({});
  const [quotaRows, setQuotaRows] = useState<QuotaRow[]>([]);
  const { baselines } = useGrowthBaselines();

  const loadBase = useCallback(async () => {
    setLoading(true);
    // Realizado oficial (Metabase) — 24 meses para cobrir a janela e o histórico de churn.
    const fromMonth = addMonths(monthKeyOf(new Date()), -24);
    const [aggRes, ovRes, rolesRes, profRes] = await Promise.all([
      fetchAllPaged<any>(() =>
        supabase
          .from("metabase_monthly_agg")
          .select("year_month, metric_key, realized_amount")
          // Realizado oficial: métricas por agregadora (cada metric_key tem 1 linha
          // por mês no escopo company; category_id fica preenchido).
          .eq("scope", "company")
          .is("team_id", null)
          .is("user_id", null)
          .is("campaign_id", null)
          .gte("year_month", `${fromMonth}-01`)
          .order("year_month")
          .order("metric_key") as never,
      ),
      supabase.from("commercial_plan_months").select("*").order("year_month"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);

    // Realizado por mês a partir das métricas oficiais.
    const map = new Map<string, RealizedMonth>();
    for (const row of (aggRes.data as any[]) || []) {
      const key = String(row.metric_key || "");
      if (!REALIZED_METRICS.has(key)) continue;
      const ym = String(row.year_month || "").slice(0, 7);
      const entry = map.get(ym) || { yearMonth: ym, newMrr: null, churnMrr: null, netMrr: null, totalMrr: null, ativos: null };
      const amount = toNum(row.realized_amount);
      if (key === "new_mrr") entry.newMrr = amount;
      else if (key === "churn_mrr") entry.churnMrr = amount;
      else if (key === "net_mrr") entry.netMrr = amount;
      else if (key === "total_mrr") entry.totalMrr = amount;
      else if (key === "ativos_pagantes") entry.ativos = amount;
      map.set(ym, entry);
    }
    setRealized(Array.from(map.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)));
    setOverrides((ovRes.data as CommercialPlanMonthRow[]) || []);

    // Histórico de New MRR por vendedor (janela de 6 meses fechados + vigente).
    const now = new Date();
    const historyFrom = `${addMonths(monthKeyOf(now), -6)}-01`;
    const histRes = await fetchAllPaged<any>(() =>
      supabase
        .from("stripe_conversions")
        .select("converted_at, assigned_seller_id, mrr, mrr_net, delta_mrr, conversion_type, is_reactivation")
        .gte("converted_at", `${historyFrom}T00:00:00-03:00`)
        .order("converted_at", { ascending: true }) as never,
    );
    const history: Record<string, number> = {};
    for (const row of (histRes.data as any[]) || []) {
      const sid = row.assigned_seller_id;
      if (!sid) continue;
      history[sid] = (history[sid] || 0) + newMrrFromConversions([row]);
    }

    // Vendedores: papel 'seller' no user_roles + quem tem conversões atribuídas
    // na janela (mesmo sem o papel cadastrado), para o rateio não sair zerado.
    const historySellers = Object.keys(history);
    const sellerIds = new Set([
      ...((rolesRes.data as any[]) || []).filter((r) => r.role === "seller").map((r) => r.user_id),
      ...historySellers,
    ]);
    const sellerList = ((profRes.data as any[]) || [])
      .filter((p) => sellerIds.has(p.user_id))
      .map((p) => ({ id: p.user_id, name: p.full_name || p.user_id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setSellers(sellerList);
    setSellerHistory(history);

    setLoading(false);
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const loadQuotas = useCallback(async (yearMonth: string) => {
    const { data } = await supabase
      .from("commercial_plan_quotas")
      .select("*")
      .eq("year_month", `${yearMonth}-01`)
      .order("seller_id");
    setQuotaRows((data as QuotaRow[]) || []);
  }, []);

  const avgChurn = useMemo(() => {
    const lastRealized = [...realized].filter((r) => r.churnMrr != null).pop();
    if (!lastRealized) return null;
    // média referente ao próximo mês ainda sem realizado (plano vigente)
    return averageChurnMrr(realized, addMonths(lastRealized.yearMonth, 1), 3);
  }, [realized]);

  const lastRealizedMonth = useMemo(
    () => [...realized].filter((r) => r.totalMrr != null).pop() || null,
    [realized],
  );

  const avgTicket = useMemo(() => null, []); // preenchido pelo funil selecionado (useFunnelKpis)

  const saveOverride = useCallback(async (yearMonth: string, patch: Partial<CommercialPlanMonthRow>) => {
    const payload = { year_month: `${yearMonth}-01`, ...patch };
    const { error } = await supabase
      .from("commercial_plan_months")
      .upsert(payload, { onConflict: "year_month" });
    if (error) throw new Error(error.message);
    setOverrides((prev) => {
      const idx = prev.findIndex((o) => o.year_month === `${yearMonth}-01`);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch } as CommercialPlanMonthRow;
        return next;
      }
      return [...prev, { id: `tmp-${yearMonth}`, year_month: `${yearMonth}-01`, target_new_mrr: null, target_churn_mrr: null, target_deals: null, target_ativos: null, notes: null, is_locked: false, ...patch } as CommercialPlanMonthRow];
    });
  }, []);

  const saveQuotas = useCallback(async (yearMonth: string, rows: Array<Omit<QuotaRow, "id" | "year_month">>) => {
    await supabase.from("commercial_plan_quotas").delete().eq("year_month", `${yearMonth}-01`);
    if (!rows.length) {
      setQuotaRows([]);
      return;
    }
    const payload = rows.map((r) => ({ ...r, year_month: `${yearMonth}-01` }));
    const { error } = await supabase.from("commercial_plan_quotas").insert(payload);
    if (error) throw new Error(error.message);
    await loadQuotas(yearMonth);
  }, [loadQuotas]);

  return {
    loading,
    realized,
    baselines,
    overrides,
    overridesByMonth: useMemo(
      () => new Map(overrides.map((o) => [o.year_month.slice(0, 7), o])),
      [overrides],
    ),
    sellers,
    sellerHistory,
    quotaRows,
    loadQuotas,
    saveOverride,
    saveQuotas,
    avgChurn,
    lastRealizedMonth,
    avgTicket,
    reloadBase: loadBase,
  };
}

/** Histórico mensal por vendedor a partir das conversões do Stripe. */
export function useSellerMonthHistory(sellers: SellerLite[]) {
  const [data, setData] = useState<Record<string, Record<string, number>>>({}); // ym → sellerId → mrr
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const from = `${addMonths(monthKeyOf(new Date()), -12)}-01`;
      const res = await fetchAllPaged<any>(() =>
        supabase
          .from("stripe_conversions")
          .select("converted_at, assigned_seller_id, mrr, mrr_net, delta_mrr, conversion_type, is_reactivation")
          .gte("converted_at", `${from}T00:00:00-03:00`)
          .order("converted_at", { ascending: true }) as never,
      );
      if (cancelled) return;
      const out: Record<string, Record<string, number>> = {};
      const sellerIds = new Set(sellers.map((s) => s.id));
      for (const row of (res.data as any[]) || []) {
        const sid = row.assigned_seller_id;
        if (!sid || !sellerIds.has(sid)) continue;
        const ym = String(row.converted_at || "").slice(0, 7);
        if (!ym) continue;
        out[ym] = out[ym] || {};
        out[ym][sid] = (out[ym][sid] || 0) + newMrrFromConversions([row]);
      }
      setData(out);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sellers]);

  return { byMonth: data, loading };
}

/** Taxas de conversão dos últimos meses fechados do funil selecionado. */
export function useFunnelKpis(funnelId: string, monthsBack = 3) {
  const [funnels, setFunnels] = useState<Array<{ ac_group_id: string; title: string; is_connected: boolean | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<FunnelKpiMonth[]>([]);
  const [openPipeline, setOpenPipeline] = useState<number | null>(null);
  const [hasFunnelData, setHasFunnelData] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("ac_funnels").select("ac_group_id, title, is_connected").order("title");
      setFunnels((data as any[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!funnelId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const now = new Date();
      const ymNow = monthKeyOf(now);
      // Últimos `monthsBack` meses FECHADOS + mês vigente (para o pipeline atual).
      const months: string[] = [];
      for (let i = monthsBack; i >= 0; i--) months.push(addMonths(ymNow, -i));
      const firstFrom = `${months[0]}-01`;
      const eventsRes = await fetchAllPaged<any>(() =>
        supabase
          .from("ac_funnel_stage_events")
          .select("ac_deal_id, event_type, from_stage_id, to_stage_id, deal_value, owner_name, occurred_at")
          .eq("ac_group_id", funnelId)
          .gte("occurred_at", `${firstFrom}T00:00:00-03:00`)
          .order("occurred_at", { ascending: true }) as never,
      );
      const [stagesRes, dealsRes] = await Promise.all([
        supabase.from("ac_funnel_stages").select("ac_stage_id, title, position").eq("ac_group_id", funnelId).order("position"),
        fetchAllPaged<any>(() =>
          supabase.from("ac_funnel_deals").select("ac_deal_id, ac_stage_id, status, value").eq("ac_group_id", funnelId).order("ac_deal_id") as never,
        ),
      ]);
      if (cancelled) return;

      const stages = (stagesRes.data as any[]) || [];
      const deals = (dealsRes.data as any[]) || [];
      const events = (eventsRes.data as any[]) || [];

      // Pipeline atual: negócios abertos (status 0) no funil.
      setOpenPipeline(deals.filter((d) => Number(d.status) === 0).reduce((s, d) => s + Number(d.value || 0), 0));

      // KPIs por mês (fechados): winRate e ticket médio.
      const { computeConversionKpis } = await import("@/lib/acFunnelKpis");
      const out: FunnelKpiMonth[] = [];
      for (const ym of months) {
        if (ym === ymNow) continue; // mês vigente entra depois de fechado
        const from = `${ym}-01T00:00:00-03:00`;
        const [y, m] = ym.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const to = `${ym}-${String(lastDay).padStart(2, "0")}T23:59:59-03:00`;
        const monthEvents = events.filter((e) => {
          const at = String(e.occurred_at || "");
          return at >= from.slice(0, 11) && at <= to.slice(0, 11);
        });
        const kpi = computeConversionKpis(monthEvents as any, deals as any, stages as any);
        out.push({ yearMonth: ym, winRate: kpi.winRate, avgTicket: kpi.avgTicket });
      }
      setKpis(out.reverse());
      setHasFunnelData(events.length > 0 || deals.length > 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [funnelId, monthsBack]);

  return { funnels, kpis, openPipeline, loading, hasFunnelData };
}
