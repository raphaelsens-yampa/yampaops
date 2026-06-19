import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PeriodNavigator, getPeriodRange, type Granularity } from "./PeriodNavigator";
import { GoalKpiCards } from "./GoalKpiCards";
import { GoalProgressChart } from "./GoalProgressChart";
import { SellerRankingTable, type SellerRow } from "./SellerRankingTable";
import { TeamRankingTable, type TeamRow } from "./TeamRankingTable";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isWeekend,
  differenceInCalendarDays, isAfter, startOfDay,
} from "date-fns";
import { GoalsBreakdownByCategory, type CategoryRow } from "./GoalsBreakdownByCategory";
import { AREA_LABELS, FINANCIAL_SLUGS, STRIPE_DRIVEN_SLUGS, STRIPE_AREA_BY_SLUG, type GoalCategory } from "@/lib/goalCategories";

function businessDaysInRange(start: Date, end: Date) {
  return eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d)).length;
}

function getConversionSellerId(sc: any, oppById: Map<string, any>, priceMapByPriceId: Map<string, any>) {
  const opp = sc.matched_opportunity_id ? oppById.get(sc.matched_opportunity_id) : null;
  return opp?.consultant_id || (sc.stripe_price_id ? priceMapByPriceId.get(sc.stripe_price_id)?.seller_user_id : null) || null;
}

export function GoalsTracking() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [granularity, setGranularity] = useState<Granularity>("month");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [profiles, setProfiles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [stripeConversions, setStripeConversions] = useState<any[]>([]);
  const [priceMap, setPriceMap] = useState<any[]>([]);
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [financeSettings, setFinanceSettings] = useState<{ avg_churn_rate: number; avg_campaign_cost: number } | null>(null);
  const [wonStageIds, setWonStageIds] = useState<Set<string>>(new Set());
  const [wonStageSlugs, setWonStageSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pRes, tRes, tmRes, gRes, oRes, sRes, cRes, fRes, scRes, pmRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("teams").select("*"),
        supabase.from("team_members").select("*"),
        supabase.from("goals").select("*"),
        supabase.from("opportunities").select("id, consultant_id, estimated_mrr, stage, updated_at, converted_at, category_id"),
        supabase.from("pipeline_stages").select("id, slug, is_won"),
        supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name"),
        supabase.from("finance_settings").select("avg_churn_rate, avg_campaign_cost").limit(1).maybeSingle(),
        supabase.from("stripe_conversions").select("id, mrr, converted_at, matched_opportunity_id, stripe_price_id, area"),
        supabase.from("commission_price_map").select("price_id, area, seller_user_id, seller_label"),
      ]);
      setProfiles(pRes.data || []);
      setTeams(tRes.data || []);
      setTeamMembers(tmRes.data || []);
      setGoals(gRes.data || []);
      setOpportunities(oRes.data || []);
      setCategories((cRes.data as GoalCategory[]) || []);
      setFinanceSettings(fRes.data as any);
      setStripeConversions(scRes.data || []);
      setPriceMap(pmRes.data || []);
      const wonIds = new Set<string>();
      const wonSlugs = new Set<string>(["fechado_won"]);
      (sRes.data || []).filter((s: any) => s.is_won).forEach((s: any) => { wonIds.add(s.id); wonSlugs.add(s.slug); });
      setWonStageIds(wonIds);
      setWonStageSlugs(wonSlugs);
      setLoading(false);
    })();
  }, []);

  const { start, end } = useMemo(() => getPeriodRange(granularity, anchorDate), [granularity, anchorDate]);
  const monthStart = useMemo(() => startOfMonth(anchorDate), [anchorDate]);
  const monthEnd = useMemo(() => endOfMonth(anchorDate), [anchorDate]);

  // Resolve sellers in scope
  const sellersInScope = useMemo(() => {
    let list = profiles;
    if (!isAdmin && user) list = list.filter((p) => p.user_id === user.id);
    if (teamFilter !== "all") {
      const memberIds = new Set(teamMembers.filter((m) => m.team_id === teamFilter).map((m) => m.user_id));
      list = list.filter((p) => memberIds.has(p.user_id));
    }
    if (sellerFilter !== "all") list = list.filter((p) => p.user_id === sellerFilter);
    return list;
  }, [profiles, teamMembers, teamFilter, sellerFilter, isAdmin, user]);

  const isWonOpp = (o: any) => wonStageIds.has(o.stage) || wonStageSlugs.has(o.stage);

  const priceMapByPriceId = useMemo(() => {
    const map = new Map<string, any>();
    priceMap.forEach((m) => {
      if (m.price_id) map.set(m.price_id, m);
    });
    return map;
  }, [priceMap]);

  // Won opportunities in current period for sellers in scope
  const wonInPeriod = useMemo(() => {
    const sellerIds = new Set(sellersInScope.map((s) => s.user_id));
    return opportunities.filter((o) => {
      if (!isWonOpp(o)) return false;
      if (o.consultant_id && !sellerIds.has(o.consultant_id)) return false;
      if (!o.consultant_id && sellerFilter !== "all") return false;
      if (categoryFilter !== "all" && o.category_id !== categoryFilter) return false;
      const d = o.converted_at ? new Date(o.converted_at) : (o.updated_at ? new Date(o.updated_at) : null);
      if (!d) return false;
      return d >= start && d <= end;
    });
  }, [opportunities, sellersInScope, start, end, sellerFilter, categoryFilter, wonStageIds, wonStageSlugs]);

  // MRR Realizado = soma das conversões Stripe no período, respeitando filtros de vendedor/equipe.
  // Em visão da empresa (admin sem filtros), considera todas as conversões; com filtros, apenas as
  // que tenham deal casado com vendedor em escopo.
  const realized = useMemo(() => {
    const sellerIds = new Set(sellersInScope.map((s) => s.user_id));
    const oppById = new Map<string, any>();
    opportunities.forEach((o) => oppById.set(o.id, o));
    return stripeConversions.reduce((sum: number, sc: any) => {
      if (!sc.converted_at) return sum;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return sum;
      if (!(sellerFilter === "all" && teamFilter === "all" && isAdmin)) {
        const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
        if (!cid || !sellerIds.has(cid)) return sum;
      }
      return sum + (Number(sc.mrr) || 0);
    }, 0);
  }, [stripeConversions, opportunities, priceMapByPriceId, sellersInScope, start, end, sellerFilter, teamFilter, isAdmin]);

  // Resolve monthly target for the scope
  const monthlyTarget = useMemo(() => {
    const overlapsMonth = (g: any) => {
      const gs = new Date(g.period_start); const ge = new Date(g.period_end);
      return gs <= monthEnd && ge >= monthStart;
    };
    const matches = goals.filter(overlapsMonth);

    if (sellerFilter !== "all") {
      const userGoals = matches.filter((g) => g.scope === "user" && g.user_id === sellerFilter);
      if (userGoals.length) return userGoals.reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    }
    if (teamFilter !== "all") {
      const teamGoals = matches.filter((g) => g.scope === "team" && g.team_id === teamFilter);
      if (teamGoals.length) return teamGoals.reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
      // fallback: sum of user goals of team members
      const memberIds = new Set(teamMembers.filter((m) => m.team_id === teamFilter).map((m) => m.user_id));
      return matches.filter((g) => g.scope === "user" && memberIds.has(g.user_id)).reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    }
    if (!isAdmin && user) {
      return matches.filter((g) => g.scope === "user" && g.user_id === user.id).reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    }
    // Company-wide
    const companyGoals = matches.filter((g) => g.scope === "company");
    if (companyGoals.length) return companyGoals.reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    // fallback: sum of all user goals
    return matches.filter((g) => g.scope === "user").reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
  }, [goals, monthStart, monthEnd, teamFilter, sellerFilter, teamMembers, isAdmin, user]);

  // Period target derived from monthly
  const periodTarget = useMemo(() => {
    const monthBizDays = businessDaysInRange(monthStart, monthEnd) || 1;
    if (granularity === "month") return monthlyTarget;
    if (granularity === "day") {
      if (isWeekend(anchorDate)) return 0;
      return monthlyTarget / monthBizDays;
    }
    // week
    const weekBizDays = businessDaysInRange(start, end);
    return (monthlyTarget / monthBizDays) * weekBizDays;
  }, [granularity, monthlyTarget, monthStart, monthEnd, anchorDate, start, end]);

  const today = startOfDay(new Date());
  const totalDays = differenceInCalendarDays(end, start) + 1;
  const elapsedRaw = differenceInCalendarDays((isAfter(today, end) ? end : today), start) + 1;
  const daysElapsed = Math.max(0, Math.min(elapsedRaw, totalDays));
  const pace = daysElapsed > 0 ? (realized / daysElapsed) * totalDays : 0;

  // Realizado por vendedor a partir das conversões Stripe (mesma fonte do KPI)
  const realizedBySeller = useMemo(() => {
    const oppById = new Map<string, any>();
    opportunities.forEach((o) => oppById.set(o.id, o));
    const map = new Map<string, number>();
    stripeConversions.forEach((sc: any) => {
      if (!sc.converted_at) return;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return;
      const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
      if (!cid) return;
      map.set(cid, (map.get(cid) || 0) + (Number(sc.mrr) || 0));
    });
    return map;
  }, [stripeConversions, opportunities, priceMapByPriceId, start, end]);

  // Per-seller rows
  const sellerRows: SellerRow[] = useMemo(() => {
    return sellersInScope.map((p) => {
      const sellerRealized = realizedBySeller.get(p.user_id) || 0;

      // seller monthly target
      const userMonthly = goals
        .filter((g) => g.scope === "user" && g.user_id === p.user_id)
        .filter((g) => new Date(g.period_start) <= monthEnd && new Date(g.period_end) >= monthStart)
        .reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
      const monthBiz = businessDaysInRange(monthStart, monthEnd) || 1;
      let target = userMonthly;
      if (granularity === "day") target = isWeekend(anchorDate) ? 0 : userMonthly / monthBiz;
      else if (granularity === "week") target = (userMonthly / monthBiz) * businessDaysInRange(start, end);

      return { user_id: p.user_id, name: p.full_name || "—", target, realized: sellerRealized };
    });
  }, [sellersInScope, realizedBySeller, goals, monthStart, monthEnd, granularity, anchorDate, start, end]);

  // Per-team rows (admin only)
  const teamRows: TeamRow[] = useMemo(() => {
    if (!isAdmin) return [];
    return teams.map((t) => {
      const memberIds = new Set(teamMembers.filter((m) => m.team_id === t.id).map((m) => m.user_id));
      const teamSellers = sellerRows.filter((r) => memberIds.has(r.user_id));
      const realizedSum = teamSellers.reduce((s, r) => s + r.realized, 0);

      // Team-scope monthly goal, fallback to sum of members
      const teamMonthly = goals
        .filter((g) => g.scope === "team" && g.team_id === t.id)
        .filter((g) => new Date(g.period_start) <= monthEnd && new Date(g.period_end) >= monthStart)
        .reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
      let target = teamMonthly || teamSellers.reduce((s, r) => {
        // reverse-derive monthly from current period target proportion
        if (granularity === "month") return s + r.target;
        return s + 0;
      }, 0);
      if (teamMonthly) {
        const monthBiz = businessDaysInRange(monthStart, monthEnd) || 1;
        if (granularity === "day") target = isWeekend(anchorDate) ? 0 : teamMonthly / monthBiz;
        else if (granularity === "week") target = (teamMonthly / monthBiz) * businessDaysInRange(start, end);
        else target = teamMonthly;
      } else {
        target = teamSellers.reduce((s, r) => s + r.target, 0);
      }
      const top = [...teamSellers].sort((a, b) => b.realized - a.realized)[0];
      return { team_id: t.id, name: t.name, target, realized: realizedSum, topPerformer: top && top.realized > 0 ? top.name : undefined };
    });
  }, [isAdmin, teams, teamMembers, sellerRows, goals, monthStart, monthEnd, granularity, anchorDate, start, end]);

  // Chart usa as conversões Stripe (mesma fonte do KPI Realizado)
  const wonForChart = useMemo(() => {
    const sellerIds = new Set(sellersInScope.map((s) => s.user_id));
    const oppById = new Map<string, any>();
    opportunities.forEach((o) => oppById.set(o.id, o));
    const out: { date: Date; mrr: number }[] = [];
    stripeConversions.forEach((sc: any) => {
      if (!sc.converted_at) return;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return;
      if (!(sellerFilter === "all" && teamFilter === "all" && isAdmin)) {
        const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
        if (!cid || !sellerIds.has(cid)) return;
      }
      out.push({ date: d, mrr: Number(sc.mrr) || 0 });
    });
    return out;
  }, [stripeConversions, opportunities, priceMapByPriceId, sellersInScope, start, end, sellerFilter, teamFilter, isAdmin]);

  // Breakdown por categoria
  const categoryRows: CategoryRow[] = useMemo(() => {
    const sellerIds = new Set(sellersInScope.map((s) => s.user_id));

    // Won opportunities in scope (sem filtrar por categoria — para breakdown)
    const wonScope = opportunities.filter((o) => {
      if (!isWonOpp(o)) return false;
      if (o.consultant_id && !sellerIds.has(o.consultant_id)) return false;
      if (!o.consultant_id && sellerFilter !== "all") return false;
      const d = o.updated_at ? new Date(o.updated_at) : null;
      if (!d) return false;
      return d >= start && d <= end;
    });

    const monthBiz = businessDaysInRange(monthStart, monthEnd) || 1;

    const proratedTarget = (monthly: number) => {
      if (granularity === "month") return monthly;
      if (granularity === "day") return isWeekend(anchorDate) ? 0 : monthly / monthBiz;
      return (monthly / monthBiz) * businessDaysInRange(start, end);
    };

    // Index opportunities by id for Stripe-driven attribution
    const oppById = new Map<string, any>();
    opportunities.forEach((o) => oppById.set(o.id, o));

    // Stripe conversions já filtradas pelo período e escopo de vendedor
    const stripeInScope = stripeConversions.filter((sc: any) => {
      if (!sc.converted_at) return false;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return false;
      if (sellerFilter === "all" && teamFilter === "all" && isAdmin) return true;
      const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
      if (!cid) return false;
      return sellerIds.has(cid);
    });
    const stripeMrrSum = stripeInScope.reduce((s: number, sc: any) => s + (Number(sc.mrr) || 0), 0);
    const stripeMrrByArea = new Map<string, number>();
    stripeInScope.forEach((sc: any) => {
      const a = sc.area || "desconhecida";
      stripeMrrByArea.set(a, (stripeMrrByArea.get(a) || 0) + (Number(sc.mrr) || 0));
    });

    return categories.map((cat) => {
      const matchingGoals = goals.filter((g) => {
        if (g.category_id !== cat.id) return false;
        const gs = new Date(g.period_start); const ge = new Date(g.period_end);
        if (!(gs <= monthEnd && ge >= monthStart)) return false;
        if (sellerFilter !== "all") return g.scope === "user" && g.user_id === sellerFilter;
        if (teamFilter !== "all") return (g.scope === "team" && g.team_id === teamFilter) || (g.scope === "user" && sellerIds.has(g.user_id));
        return true;
      });
      const monthlyTargetCat = matchingGoals.reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
      const target = proratedTarget(monthlyTargetCat);

      let realizedCat = 0;
      let source: "stripe" | "manual" | "calculated" = "calculated";
      let manualOverride = false;
      const overrideSum = matchingGoals.reduce((s, g) => {
        const v = g.realized_override;
        return v != null ? s + Number(v) : s;
      }, 0);
      const hasOverride = matchingGoals.some((g) => g.realized_override != null);

      // Valor automático Stripe específico para esta categoria (filtrado por área)
      const stripeArea = STRIPE_AREA_BY_SLUG[cat.slug];
      const stripeAutoForCat = stripeArea ? (stripeMrrByArea.get(stripeArea) || 0) : 0;

      if (STRIPE_DRIVEN_SLUGS.has(cat.slug)) {
        source = "stripe";
        if (hasOverride) {
          realizedCat = overrideSum;
          manualOverride = true;
          source = "manual";
        } else {
          realizedCat = stripeAutoForCat;
        }
      } else if (cat.slug === FINANCIAL_SLUGS.LTV) {
        const wonAll = wonScope;
        const avgMrr = wonAll.length ? wonAll.reduce((s, o) => s + (Number(o.estimated_mrr) || 0), 0) / wonAll.length : 0;
        const churn = (financeSettings?.avg_churn_rate || 0) / 100;
        realizedCat = churn > 0 ? avgMrr / churn : 0;
      } else if (cat.slug === FINANCIAL_SLUGS.CAC) {
        const campaignCat = categories.find((c) => c.slug === FINANCIAL_SLUGS.CAMPANHA_MRR);
        const conversions = campaignCat ? wonScope.filter((o) => o.category_id === campaignCat.id).length : 0;
        const cost = financeSettings?.avg_campaign_cost || 0;
        realizedCat = conversions > 0 ? cost / conversions : 0;
      } else if (cat.slug === FINANCIAL_SLUGS.LTV_CAC) {
        const wonAll = wonScope;
        const avgMrr = wonAll.length ? wonAll.reduce((s, o) => s + (Number(o.estimated_mrr) || 0), 0) / wonAll.length : 0;
        const churn = (financeSettings?.avg_churn_rate || 0) / 100;
        const ltv = churn > 0 ? avgMrr / churn : 0;
        const campaignCat = categories.find((c) => c.slug === FINANCIAL_SLUGS.CAMPANHA_MRR);
        const conversions = campaignCat ? wonScope.filter((o) => o.category_id === campaignCat.id).length : 0;
        const cost = financeSettings?.avg_campaign_cost || 0;
        const cac = conversions > 0 ? cost / conversions : 0;
        realizedCat = cac > 0 ? ltv / cac : 0;
      } else if (cat.metric_type === "count") {
        realizedCat = wonScope.filter((o) => o.category_id === cat.id).length;
      } else {
        realizedCat = wonScope.filter((o) => o.category_id === cat.id).reduce((s, o) => s + (Number(o.estimated_mrr) || 0), 0);
      }

      return {
        category: cat,
        target,
        realized: realizedCat,
        source,
        manualOverride,
        goalIds: matchingGoals.map((g) => g.id),
        autoValue: STRIPE_DRIVEN_SLUGS.has(cat.slug) ? stripeAutoForCat : null,
      };
    }).filter((r) => r.target > 0 || r.realized > 0);
  }, [categories, goals, opportunities, stripeConversions, priceMapByPriceId, sellersInScope, sellerFilter, teamFilter, start, end, monthStart, monthEnd, granularity, anchorDate, financeSettings, wonStageIds, wonStageSlugs, isAdmin]);

  if (loading) return <p className="text-muted-foreground p-8">Carregando acompanhamento...</p>;

  return (
    <div className="space-y-6">
      <PeriodNavigator
        granularity={granularity}
        onGranularityChange={setGranularity}
        anchorDate={anchorDate}
        onAnchorChange={setAnchorDate}
      />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {isAdmin && (
            <div>
              <Label className="text-xs">Equipe</Label>
              <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setSellerFilter("all"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as equipes</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Vendedor</Label>
            <Select value={sellerFilter} onValueChange={setSellerFilter} disabled={!isAdmin && profiles.length <= 1}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {sellersInScope.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {(["sales","cs","campaign","financial"] as const).map(area => {
                  const items = categories.filter(c => c.area === area);
                  if (!items.length) return null;
                  return (
                    <div key={area}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{AREA_LABELS[area]}</div>
                      {items.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <GoalKpiCards realized={realized} target={periodTarget} pace={pace} daysElapsed={daysElapsed} totalDays={totalDays} />

      <GoalProgressChart start={start} end={end} target={periodTarget} won={wonForChart} />

      <GoalsBreakdownByCategory
        rows={categoryRows}
        onChanged={async () => {
          const { data } = await supabase.from("goals").select("*");
          setGoals(data || []);
        }}
      />

      <SellerRankingTable rows={sellerRows} />

      {isAdmin && <TeamRankingTable rows={teamRows} />}
    </div>
  );
}
