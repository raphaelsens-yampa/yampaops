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
import { ProductRankingTable, type ProductRow } from "./ProductRankingTable";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isWeekend,
  differenceInCalendarDays, isAfter, startOfDay,
} from "date-fns";
import { GoalsBreakdownByCategory, type CategoryRow } from "./GoalsBreakdownByCategory";
import { AREA_LABELS, type GoalCategory } from "@/lib/goalCategories";

function businessDaysInRange(start: Date, end: Date) {
  return eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d)).length;
}

// Preferimos assigned_seller_id gravado direto na conversão Stripe; usamos deal casado
// ou o mapa de preços apenas como fallback.
function getConversionSellerId(sc: any, oppById: Map<string, any>, priceMapByPriceId: Map<string, any>) {
  if (sc.assigned_seller_id) return sc.assigned_seller_id;
  const opp = sc.matched_opportunity_id ? oppById.get(sc.matched_opportunity_id) : null;
  if (opp?.consultant_id) return opp.consultant_id;
  if (sc.stripe_price_id) return priceMapByPriceId.get(sc.stripe_price_id)?.seller_user_id || null;
  return null;
}

// MRR sempre líquido quando disponível
function convMrr(sc: any) {
  const net = Number(sc.mrr_net);
  if (net > 0) return net;
  return Number(sc.mrr) || 0;
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
  const [campaignContacts, setCampaignContacts] = useState<any[]>([]);
  const [financeSettings, setFinanceSettings] = useState<{ avg_churn_rate: number; avg_campaign_cost: number } | null>(null);
  const [wonStageIds, setWonStageIds] = useState<Set<string>>(new Set());
  const [wonStageSlugs, setWonStageSlugs] = useState<Set<string>>(new Set());
  const [churnEvents, setChurnEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pRes, tRes, tmRes, gRes, oRes, sRes, cRes, fRes, scRes, pmRes, sccRes, chRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("teams").select("*"),
        supabase.from("team_members").select("*"),
        supabase.from("goals").select("*"),
        supabase.from("opportunities").select("id, consultant_id, estimated_mrr, stage, updated_at, converted_at, category_id"),
        supabase.from("pipeline_stages").select("id, slug, is_won"),
        supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name"),
        supabase.from("finance_settings").select("avg_churn_rate, avg_campaign_cost").limit(1).maybeSingle(),
        supabase.from("stripe_conversions").select("id, mrr, mrr_net, converted_at, matched_opportunity_id, stripe_price_id, area, assigned_seller_id, conversion_type, product_name, plan_name, stripe_customer_id"),
        supabase.from("commission_price_map").select("price_id, area, seller_user_id, seller_label"),
        supabase.from("sales_campaign_contacts").select("id, campaign_id, mrr_generated, cw_first_contact_at, updated_at"),
        supabase.from("stripe_churn_events").select("id, canceled_at, mrr_lost, stripe_customer_id, stripe_area"),
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
      setCampaignContacts(sccRes.data || []);
      setChurnEvents(chRes.data || []);
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
    priceMap.forEach((m) => { if (m.price_id) map.set(m.price_id, m); });
    return map;
  }, [priceMap]);

  const oppById = useMemo(() => {
    const map = new Map<string, any>();
    opportunities.forEach((o) => map.set(o.id, o));
    return map;
  }, [opportunities]);

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

  const stripeInScope = useMemo(() => {
    const sellerIds = new Set(sellersInScope.map((s) => s.user_id));
    const openScope = sellerFilter === "all" && teamFilter === "all" && isAdmin;
    return stripeConversions.filter((sc: any) => {
      if (!sc.converted_at) return false;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return false;
      if (openScope) return true;
      const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
      return !!cid && sellerIds.has(cid);
    });
  }, [stripeConversions, sellersInScope, oppById, priceMapByPriceId, start, end, sellerFilter, teamFilter, isAdmin]);

  const realized = useMemo(() => stripeInScope.reduce((s, sc) => s + convMrr(sc), 0), [stripeInScope]);

  const dealsRealized = useMemo(() => stripeInScope.length, [stripeInScope]);

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
      const memberIds = new Set(teamMembers.filter((m) => m.team_id === teamFilter).map((m) => m.user_id));
      return matches.filter((g) => g.scope === "user" && memberIds.has(g.user_id)).reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    }
    if (!isAdmin && user) {
      return matches.filter((g) => g.scope === "user" && g.user_id === user.id).reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    }
    const companyGoals = matches.filter((g) => g.scope === "company");
    if (companyGoals.length) return companyGoals.reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
    return matches.filter((g) => g.scope === "user").reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
  }, [goals, monthStart, monthEnd, teamFilter, sellerFilter, teamMembers, isAdmin, user]);

  const monthlyDealsTarget = useMemo(() => {
    const overlapsMonth = (g: any) => {
      const gs = new Date(g.period_start); const ge = new Date(g.period_end);
      return gs <= monthEnd && ge >= monthStart;
    };
    const matches = goals.filter(overlapsMonth);
    if (sellerFilter !== "all") return matches.filter((g) => g.scope === "user" && g.user_id === sellerFilter).reduce((s, g) => s + (Number(g.target_deals) || 0), 0);
    if (teamFilter !== "all") {
      const teamGoals = matches.filter((g) => g.scope === "team" && g.team_id === teamFilter);
      if (teamGoals.length) return teamGoals.reduce((s, g) => s + (Number(g.target_deals) || 0), 0);
    }
    const companyGoals = matches.filter((g) => g.scope === "company");
    if (companyGoals.length) return companyGoals.reduce((s, g) => s + (Number(g.target_deals) || 0), 0);
    return 0;
  }, [goals, monthStart, monthEnd, teamFilter, sellerFilter]);

  const periodTarget = useMemo(() => {
    const monthBizDays = businessDaysInRange(monthStart, monthEnd) || 1;
    if (granularity === "month") return monthlyTarget;
    if (granularity === "day") return isWeekend(anchorDate) ? 0 : monthlyTarget / monthBizDays;
    const weekBizDays = businessDaysInRange(start, end);
    return (monthlyTarget / monthBizDays) * weekBizDays;
  }, [granularity, monthlyTarget, monthStart, monthEnd, anchorDate, start, end]);

  const today = startOfDay(new Date());
  const totalDays = differenceInCalendarDays(end, start) + 1;
  const elapsedRaw = differenceInCalendarDays((isAfter(today, end) ? end : today), start) + 1;
  const daysElapsed = Math.max(0, Math.min(elapsedRaw, totalDays));
  const pace = daysElapsed > 0 ? (realized / daysElapsed) * totalDays : 0;

  const { realizedBySeller, reactivationsBySeller } = useMemo(() => {
    const mrrMap = new Map<string, number>();
    const reactMap = new Map<string, number>();
    stripeConversions.forEach((sc: any) => {
      if (!sc.converted_at) return;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return;
      const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
      if (!cid) return;
      mrrMap.set(cid, (mrrMap.get(cid) || 0) + convMrr(sc));
      if (sc.conversion_type === "reactivation") reactMap.set(cid, (reactMap.get(cid) || 0) + 1);
    });
    return { realizedBySeller: mrrMap, reactivationsBySeller: reactMap };
  }, [stripeConversions, oppById, priceMapByPriceId, start, end]);

  const sellerRows: SellerRow[] = useMemo(() => {
    return sellersInScope.map((p) => {
      const sellerRealized = realizedBySeller.get(p.user_id) || 0;
      const userMonthly = goals
        .filter((g) => g.scope === "user" && g.user_id === p.user_id)
        .filter((g) => new Date(g.period_start) <= monthEnd && new Date(g.period_end) >= monthStart)
        .reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
      const monthBiz = businessDaysInRange(monthStart, monthEnd) || 1;
      let target = userMonthly;
      if (granularity === "day") target = isWeekend(anchorDate) ? 0 : userMonthly / monthBiz;
      else if (granularity === "week") target = (userMonthly / monthBiz) * businessDaysInRange(start, end);

      return {
        user_id: p.user_id,
        name: p.full_name || "—",
        target,
        realized: sellerRealized,
        reactivations: reactivationsBySeller.get(p.user_id) || 0,
      };
    });
  }, [sellersInScope, realizedBySeller, reactivationsBySeller, goals, monthStart, monthEnd, granularity, anchorDate, start, end]);

  const orphanMrrByArea = useMemo(() => {
    const map = new Map<string, number>();
    stripeConversions.forEach((sc: any) => {
      if (!sc.converted_at) return;
      const d = new Date(sc.converted_at);
      if (d < start || d > end) return;
      const cid = getConversionSellerId(sc, oppById, priceMapByPriceId);
      if (cid) return;
      const a = sc.area || "desconhecida";
      map.set(a, (map.get(a) || 0) + convMrr(sc));
    });
    return map;
  }, [stripeConversions, oppById, priceMapByPriceId, start, end]);

  const teamRows: TeamRow[] = useMemo(() => {
    if (!isAdmin) return [];
    const coveredAreas = new Set<string>();
    const rows = teams.map((t) => {
      const memberIds = new Set(teamMembers.filter((m) => m.team_id === t.id).map((m) => m.user_id));
      const teamSellers = sellerRows.filter((r) => memberIds.has(r.user_id));
      const membersRealized = teamSellers.reduce((s, r) => s + r.realized, 0);
      const teamArea = (t as any).stripe_area || t.name;
      coveredAreas.add(teamArea);
      const orphanForTeam = orphanMrrByArea.get(teamArea) || 0;
      const realizedSum = membersRealized + orphanForTeam;

      const teamMonthly = goals
        .filter((g) => g.scope === "team" && g.team_id === t.id)
        .filter((g) => new Date(g.period_start) <= monthEnd && new Date(g.period_end) >= monthStart)
        .reduce((s, g) => s + (Number(g.target_mrr) || 0), 0);
      let target = teamMonthly;
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

    // Inclui áreas Stripe sem equipe cadastrada (ex.: "Produto") para não perder MRR do ranking
    orphanMrrByArea.forEach((mrr, area) => {
      if (!area || area === "desconhecida" || coveredAreas.has(area) || mrr <= 0) return;
      rows.push({ team_id: `area:${area}`, name: area, target: 0, realized: mrr, topPerformer: undefined });
    });

    return rows;
  }, [isAdmin, teams, teamMembers, sellerRows, orphanMrrByArea, goals, monthStart, monthEnd, granularity, anchorDate, start, end]);

  const wonForChart = useMemo(() => {
    return stripeInScope.map((sc: any) => ({ date: new Date(sc.converted_at), mrr: convMrr(sc) }));
  }, [stripeInScope]);

  const productRows: ProductRow[] = useMemo(() => {
    const map = new Map<string, { deals: number; mrr: number }>();
    stripeInScope.forEach((sc: any) => {
      const name = (sc.product_name || sc.plan_name || "Sem produto").toString().trim() || "Sem produto";
      const cur = map.get(name) || { deals: 0, mrr: 0 };
      cur.deals += 1;
      cur.mrr += convMrr(sc);
      map.set(name, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, deals: v.deals, mrr: v.mrr }));
  }, [stripeInScope]);

  // Breakdown por categoria — usa auto_source + stripe_area do banco
  const categoryRows: CategoryRow[] = useMemo(() => {
    const sellerIds = new Set(sellersInScope.map((s) => s.user_id));

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

    const stripeMrrByArea = new Map<string, number>();
    stripeInScope.forEach((sc: any) => {
      const a = sc.area || "desconhecida";
      stripeMrrByArea.set(a, (stripeMrrByArea.get(a) || 0) + convMrr(sc));
    });

    // MRR de campanhas (para escopo campaign)
    const campaignMrrById = new Map<string, number>();
    campaignContacts.forEach((c: any) => {
      const ts = c.cw_first_contact_at ? new Date(c.cw_first_contact_at) : (c.updated_at ? new Date(c.updated_at) : null);
      if (!ts || ts < start || ts > end) return;
      if (!c.campaign_id) return;
      campaignMrrById.set(c.campaign_id, (campaignMrrById.get(c.campaign_id) || 0) + (Number(c.mrr_generated) || 0));
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

      const overrideSum = matchingGoals.reduce((s, g) => {
        const v = (g as any).realized_override;
        return v != null ? s + Number(v) : s;
      }, 0);
      const hasOverride = matchingGoals.some((g) => (g as any).realized_override != null);

      const autoSource = cat.auto_source || "manual";
      const stripeArea = cat.stripe_area || null;
      const stripeAutoForCat = stripeArea ? (stripeMrrByArea.get(stripeArea) || 0) : 0;

      let realizedCat = 0;
      let source: "stripe" | "manual" | "calculated" = "calculated";
      let manualOverride = false;

      if (hasOverride) {
        realizedCat = overrideSum;
        manualOverride = true;
        source = "manual";
      } else if (autoSource === "stripe") {
        source = "stripe";
        realizedCat = stripeAutoForCat;
      } else if (autoSource === "stripe_ltv") {
        const wonAll = wonScope;
        const avgMrr = wonAll.length ? wonAll.reduce((s, o) => s + (Number(o.estimated_mrr) || 0), 0) / wonAll.length : 0;
        const churn = (financeSettings?.avg_churn_rate || 0) / 100;
        realizedCat = churn > 0 ? avgMrr / churn : 0;
      } else if (autoSource === "stripe_cac") {
        const conversions = stripeMrrByArea.get("Marketing") ? (stripeInScope.filter((sc: any) => sc.area === "Marketing").length) : 0;
        const cost = financeSettings?.avg_campaign_cost || 0;
        realizedCat = conversions > 0 ? cost / conversions : 0;
      } else if (autoSource === "stripe_ltv_cac") {
        const wonAll = wonScope;
        const avgMrr = wonAll.length ? wonAll.reduce((s, o) => s + (Number(o.estimated_mrr) || 0), 0) / wonAll.length : 0;
        const churn = (financeSettings?.avg_churn_rate || 0) / 100;
        const ltv = churn > 0 ? avgMrr / churn : 0;
        const conversions = stripeInScope.filter((sc: any) => sc.area === "Marketing").length;
        const cost = financeSettings?.avg_campaign_cost || 0;
        const cac = conversions > 0 ? cost / conversions : 0;
        realizedCat = cac > 0 ? ltv / cac : 0;
      } else if (autoSource === "deals_count") {
        realizedCat = wonScope.filter((o) => o.category_id === cat.id).length;
      } else if (cat.metric_type === "count") {
        realizedCat = wonScope.filter((o) => o.category_id === cat.id).length;
      } else {
        // manual/other: campanhas vinculadas ou opps ganhas na categoria
        const campaignGoalIds = matchingGoals.map((g) => (g as any).campaign_id).filter(Boolean);
        if (campaignGoalIds.length) {
          realizedCat = campaignGoalIds.reduce((s: number, id: string) => s + (campaignMrrById.get(id) || 0), 0);
        } else {
          realizedCat = wonScope.filter((o) => o.category_id === cat.id).reduce((s, o) => s + (Number(o.estimated_mrr) || 0), 0);
        }
      }

      const isStripeDriven = autoSource.startsWith("stripe");

      return {
        category: cat,
        target,
        realized: realizedCat,
        source,
        manualOverride,
        goalIds: matchingGoals.map((g) => g.id),
        autoValue: isStripeDriven ? stripeAutoForCat : null,
      };
    }).filter((r) => r.target > 0 || r.realized > 0);
  }, [categories, goals, opportunities, stripeInScope, sellersInScope, sellerFilter, teamFilter, start, end, monthStart, monthEnd, granularity, anchorDate, financeSettings, wonStageIds, wonStageSlugs, campaignContacts]);

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

      <GoalKpiCards
        realized={realized}
        target={periodTarget}
        pace={pace}
        daysElapsed={daysElapsed}
        totalDays={totalDays}
        dealsRealized={dealsRealized}
        dealsTarget={monthlyDealsTarget}
      />

      <GoalProgressChart start={start} end={end} target={periodTarget} won={wonForChart} />

      <GoalsBreakdownByCategory
        rows={categoryRows}
        onChanged={async () => {
          const { data } = await supabase.from("goals").select("*");
          setGoals(data || []);
        }}
      />

      <SellerRankingTable rows={sellerRows} />

      <ProductRankingTable rows={productRows} />

      {isAdmin && <TeamRankingTable rows={teamRows} />}
    </div>
  );
}
