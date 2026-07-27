import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AREA_LABELS, isBetterBelow, type GoalCategory } from "@/lib/goalCategories";
import { parseDateBR, parseDateBRStart, parseDateBREnd } from "@/lib/dateBR";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

type Period = "day" | "week" | "month" | "custom" | "year";
type CompareMode = "to_date" | "full";

interface AggRow {
  year_month: string;
  metric_key: string;
  scope: string;
  team_id: string | null;
  user_id: string | null;
  campaign_id: string | null;
  category_id: string | null;
  area: string | null;
  realized_amount: number;
  deals_count: number;
}

interface Goal {
  id: string;
  scope: string;
  team_id: string | null;
  user_id: string | null;
  campaign_id: string | null;
  category_id: string | null;
  period_start: string;
  period_end: string;
  target_mrr: number;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function daysBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 86400000 + 1;
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (e < s) return 0;
  return daysBetween(s, e);
}

function targetFraction(gStart: string, gEnd: string, winFrom: Date, winTo: Date): number {
  const gs = parseDateBRStart(gStart);
  const ge = parseDateBREnd(gEnd);
  const goalDays = Math.max(1, daysBetween(gs, ge));
  const ov = overlapDays(gs, ge, winFrom, winTo);
  return ov / goalDays;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6);
  s.setHours(23, 59, 59, 999);
  return s;
}

export function MetabaseTracking() {
  const [period, setPeriod] = useState<Period>("year");
  const now = new Date();
  const [customFrom, setCustomFrom] = useState(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10));
  const [year, setYear] = useState(now.getFullYear());
  const [compareMode, setCompareMode] = useState<CompareMode>("to_date");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");


  const [scope, setScope] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [teamId, setTeamId] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [goalId, setGoalId] = useState<string>("all");

  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [agg, setAgg] = useState<AggRow[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [maxCapture, setMaxCapture] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [cRes, tRes, pRes, campRes] = await Promise.all([
        supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name"),
        supabase.from("teams").select("id, name"),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("sales_campaigns").select("id, name").order("name"),
      ]);
      setCategories((cRes.data as GoalCategory[]) || []);
      setTeams(tRes.data || []);
      setProfiles(pRes.data || []);
      setCampaigns(campRes.data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [aggRes, goalsRes, capRes] = await Promise.all([
        supabase.from("metabase_monthly_agg").select("*"),
        supabase.from("goals").select("*"),
        supabase.from("metabase_daily_raw").select("capture_date").order("capture_date", { ascending: false }).limit(1),
      ]);
      setAgg((aggRes.data as AggRow[]) || []);
      setGoals((goalsRes.data as Goal[]) || []);
      setMaxCapture(((capRes.data as any[]) || [])[0]?.capture_date || null);
      setLoading(false);
    })();
  }, []);

  const selectedGoal = useMemo(() => goals.find((g) => g.id === goalId), [goals, goalId]);

  const scopedFilter = (r: { scope: string; team_id: string | null; user_id: string | null; campaign_id: string | null; category_id: string | null }) => {
    if (selectedGoal) {
      if (r.scope !== selectedGoal.scope) return false;
      if ((r.category_id || null) !== (selectedGoal.category_id || null)) return false;
      if ((r.team_id || null) !== (selectedGoal.team_id || null)) return false;
      if ((r.user_id || null) !== (selectedGoal.user_id || null)) return false;
      if ((r.campaign_id || null) !== (selectedGoal.campaign_id || null)) return false;
      return true;
    }
    if (scope !== "all" && r.scope !== scope) return false;
    if (categoryId !== "all" && r.category_id !== categoryId) return false;
    if (teamId !== "all" && r.team_id !== teamId) return false;
    if (userId !== "all" && r.user_id !== userId) return false;
    if (campaignId !== "all" && r.campaign_id !== campaignId) return false;
    return true;
  };

  const filteredGoals = useMemo(() => {
    if (selectedGoal) return [selectedGoal];
    return goals.filter((g) => scopedFilter({ ...g }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, selectedGoal, scope, categoryId, teamId, userId, campaignId]);

  // Mapa de categorias virtuais (agrupadoras) → set de componentes
  const virtualComponents = useMemo(() => {
    const map = new Map<string, Set<string>>();
    categories.forEach((c) => {
      if (c.component_category_ids && c.component_category_ids.length) {
        map.set(c.id, new Set(c.component_category_ids));
      }
    });
    return map;
  }, [categories]);

  // Mapa reverso: componente → categorias virtuais que o agrupam
  const componentToVirtuals = useMemo(() => {
    const map = new Map<string, string[]>();
    virtualComponents.forEach((comps, virtualId) => {
      comps.forEach((comp) => {
        const arr = map.get(comp) || [];
        arr.push(virtualId);
        map.set(comp, arr);
      });
    });
    return map;
  }, [virtualComponents]);

  // Expande um id de categoria em: ele mesmo + componentes (se for virtual)
  const expandCategoryIds = (id: string): string[] => {
    const comps = virtualComponents.get(id);
    if (!comps) return [id];
    return [id, ...Array.from(comps)];
  };

  // Restringe as categorias analisadas ao conjunto das metas filtradas.
  // Assim, quando o usuário afunila por vendedor/time/categoria e sobra 1 meta,
  // o Realizado (KPI/tabela/gráfico) considera SOMENTE a categoria da(s) meta(s) — não todas as métricas do Metabase.
  // Se a meta é sobre uma categoria virtual (agrupadora), inclui também os componentes.
  const allowedCategoryIds = useMemo(() => {
    if (!filteredGoals.length) return null as null | Set<string>;
    const s = new Set<string>();
    filteredGoals.forEach((g) => {
      if (!g.category_id) return;
      expandCategoryIds(g.category_id).forEach((id) => s.add(id));
    });
    return s.size ? s : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGoals, virtualComponents]);

  const scopedAggFilter = (r: { scope: string; team_id: string | null; user_id: string | null; campaign_id: string | null; category_id: string | null }) => {
    // Reusar scopedFilter mas ignorar seu check de categoria — trataremos abaixo com expansão de virtuais.
    if (selectedGoal) {
      if (r.scope !== selectedGoal.scope) return false;
      if ((r.team_id || null) !== (selectedGoal.team_id || null)) return false;
      if ((r.user_id || null) !== (selectedGoal.user_id || null)) return false;
      if ((r.campaign_id || null) !== (selectedGoal.campaign_id || null)) return false;
      // categoria: aceita se for a própria ou um componente (quando a meta é virtual)
      const allowed = new Set(expandCategoryIds(selectedGoal.category_id || ""));
      if (!r.category_id || !allowed.has(r.category_id)) return false;
      return true;
    }
    if (scope !== "all" && r.scope !== scope) return false;
    if (teamId !== "all" && r.team_id !== teamId) return false;
    if (userId !== "all" && r.user_id !== userId) return false;
    if (campaignId !== "all" && r.campaign_id !== campaignId) return false;
    if (categoryId !== "all") {
      const allowed = new Set(expandCategoryIds(categoryId));
      if (!r.category_id || !allowed.has(r.category_id)) return false;
    }
    if (allowedCategoryIds && (!r.category_id || !allowedCategoryIds.has(r.category_id))) return false;
    return true;
  };

  const monthList = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)), [year]);

  // Janela efetiva do filtro Período
  const windowRange = useMemo(() => {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (period === "day") {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      return { from: s, to: today };
    }
    if (period === "week") return { from: startOfWeek(new Date()), to: endOfWeek(new Date()) };
    if (period === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: s, to: e };
    }
    if (period === "custom") {
      const s = new Date(customFrom + "T00:00:00");
      const e = new Date(customTo + "T23:59:59");
      return { from: s, to: e };
    }
    // year
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999) };
  }, [period, customFrom, customTo, year]);

  // Cap superior "Comparar até hoje": limita meta ao min(windowRange.to, hoje, últimoMêsCapturado+fim)
  const effectiveWindow = useMemo(() => {
    if (compareMode === "full") return windowRange;
    const today = new Date(); today.setHours(23, 59, 59, 999);
    let cap = today < windowRange.to ? today : windowRange.to;
    if (maxCapture) {
      const [y, m] = maxCapture.split("-").map(Number);
      const capMonthEnd = new Date(y, m, 0, 23, 59, 59, 999); // last day of that month
      if (capMonthEnd < cap) cap = capMonthEnd;
    }
    return { from: windowRange.from, to: cap < windowRange.from ? windowRange.from : cap };
  }, [windowRange, compareMode, maxCapture]);

  // Span das metas filtradas (união do menor start ao maior end)
  const goalsSpan = useMemo(() => {
    if (!filteredGoals.length) return null as null | { from: Date; to: Date };
    let s: Date | null = null, e: Date | null = null;
    filteredGoals.forEach((g) => {
      const gs = parseDateBRStart(g.period_start);
      const ge = parseDateBREnd(g.period_end);
      if (!s || gs < s) s = gs;
      if (!e || ge > e) e = ge;
    });
    return { from: s!, to: e! };
  }, [filteredGoals]);

  // Janela de comparação = interseção da janela do filtro com o span das metas selecionadas
  const compareWindow = useMemo(() => {
    if (!goalsSpan) return effectiveWindow;
    const from = effectiveWindow.from > goalsSpan.from ? effectiveWindow.from : goalsSpan.from;
    const toRaw = effectiveWindow.to < goalsSpan.to ? effectiveWindow.to : goalsSpan.to;
    const to = toRaw < from ? from : toRaw;
    return { from, to };
  }, [effectiveWindow, goalsSpan]);

  const inWindow = (ym: string) => {
    // year_month is YYYY-MM-01 (parse as Brazil local calendar)
    const d = parseDateBR(ym);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return overlapDays(d, monthEnd, compareWindow.from, compareWindow.to) > 0;
  };

  // Nunca misturar categoria virtual com seus componentes para evitar dupla contagem
  // (o bucket da virtual já é a soma dos componentes via componentToVirtuals).
  const isVirtual = (id: string) => virtualComponents.has(id);
  const categoriesForTable = useMemo(() => {
    // Seleção explícita (meta ou filtro) — mostra apenas aquela categoria
    if (selectedGoal?.category_id) return categories.filter((c) => c.id === selectedGoal.category_id);
    if (categoryId !== "all") return categories.filter((c) => c.id === categoryId);
    // Filtros restringiram para um conjunto de metas
    if (allowedCategoryIds) {
      // Se alguma meta é virtual, mostra apenas as virtuais das metas (não seus componentes)
      const goalCatIds = new Set(filteredGoals.map((g) => g.category_id).filter(Boolean) as string[]);
      if (Array.from(goalCatIds).some((id) => isVirtual(id))) {
        return categories.filter((c) => goalCatIds.has(c.id));
      }
      return categories.filter((c) => allowedCategoryIds.has(c.id) && !isVirtual(c.id));
    }
    // Sem filtro: exibe todas as folhas (exclui virtuais para não duplicar somas)
    return categories.filter((c) => !isVirtual(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categoryId, selectedGoal, allowedCategoryIds, filteredGoals, virtualComponents]);

  // Realized per (category, month) — recortado pela janela de comparação (interseção filtro × meta)
  // e restrito às categorias das metas filtradas (evita somar new_mrr + total_mrr + churn etc.).
  const realizedByCatMonth = useMemo(() => {
    const map = new Map<string, number>();
    const addTo = (catId: string, monthIdx: number, val: number) => {
      const key = `${catId}|${monthIdx}`;
      map.set(key, (map.get(key) || 0) + val);
    };
    agg.filter(scopedAggFilter).forEach((r) => {
      if (!inWindow(r.year_month)) return;
      const d = parseDateBR(r.year_month);
      if (d.getFullYear() !== year) return;
      const v = Number(r.realized_amount || 0);
      const catId = r.category_id || "none";
      addTo(catId, d.getMonth(), v);
      // Se essa categoria é componente de uma virtual, agrega no bucket da virtual também
      const virtuals = componentToVirtuals.get(catId);
      if (virtuals) virtuals.forEach((vId) => addTo(vId, d.getMonth(), v));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agg, scope, categoryId, teamId, userId, campaignId, goalId, year, compareWindow, allowedCategoryIds, componentToVirtuals]);

  // Target per (category, month) — meta cheia por mês (para tabela e gráfico mensal)
  const targetByCatMonth = useMemo(() => {
    const map = new Map<string, number>();
    filteredGoals.forEach((g) => {
      monthList.forEach((mStart, idx) => {
        const mEnd = new Date(year, idx + 1, 0, 23, 59, 59, 999);
        const frac = targetFraction(g.period_start, g.period_end, mStart, mEnd);
        if (frac <= 0) return;
        const key = `${g.category_id || "none"}|${idx}`;
        map.set(key, (map.get(key) || 0) + (g.target_mrr || 0) * frac);
      });
    });
    return map;
  }, [filteredGoals, monthList, year]);

  // Meta do Período — soma total das metas selecionadas cujo intervalo intersecta a janela (SEM rateio)
  const totalPeriodTarget = useMemo(() => {
    let sum = 0;
    filteredGoals.forEach((g) => {
      const gs = parseDateBRStart(g.period_start);
      const ge = parseDateBREnd(g.period_end);
      if (overlapDays(gs, ge, windowRange.from, windowRange.to) > 0) {
        sum += Number(g.target_mrr || 0);
      }
    });
    return sum;
  }, [filteredGoals, windowRange]);

  // Meta rateada (parcial) — proporcional ao tempo já transcorrido dentro da janela de comparação
  const totalTargetProrated = useMemo(() => {
    let sum = 0;
    filteredGoals.forEach((g) => {
      const gs = parseDateBRStart(g.period_start);
      const ge = parseDateBREnd(g.period_end);
      const gDays = Math.max(1, daysBetween(gs, ge));
      const ov = overlapDays(gs, ge, compareWindow.from, compareWindow.to);
      if (ov <= 0) return;
      sum += Number(g.target_mrr || 0) * (ov / gDays);
    });
    return sum;
  }, [filteredGoals, compareWindow]);

  const monthInWindow = (idx: number) => {
    const s = new Date(year, idx, 1);
    const e = new Date(year, idx + 1, 0, 23, 59, 59, 999);
    return overlapDays(s, e, compareWindow.from, compareWindow.to) > 0;
  };

  const chartData = useMemo(() => {
    return monthList.map((_, idx) => {
      let realized = 0;
      let target = 0;
      categoriesForTable.forEach((c) => {
        realized += realizedByCatMonth.get(`${c.id}|${idx}`) || 0;
        target += targetByCatMonth.get(`${c.id}|${idx}`) || 0;
      });
      return { month: MONTHS[idx], Meta: Math.round(target), Realizado: Math.round(realized), inWin: monthInWindow(idx) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthList, categoriesForTable, realizedByCatMonth, targetByCatMonth, compareWindow]);

  // Meses cobertos pelo Metabase no ano selecionado
  const coveredMonths = useMemo(() => {
    const s = new Set<number>();
    agg.forEach((r) => {
      const d = parseDateBR(r.year_month);
      if (d.getFullYear() === year) s.add(d.getMonth());
    });
    return s;
  }, [agg, year]);

  const missingMonthsInWindow = useMemo(() => {
    const missing: string[] = [];
    monthList.forEach((_, idx) => {
      if (monthInWindow(idx) && !coveredMonths.has(idx)) missing.push(MONTHS[idx]);
    });
    return missing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthList, coveredMonths, compareWindow]);

  const totalRealized = chartData.reduce((s, r) => s + r.Realizado, 0);
  const totalTarget = totalTargetProrated;
  const totalPct = totalPeriodTarget > 0 ? (totalRealized / totalPeriodTarget) * 100 : 0;

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const hasAggData = agg.length > 0;

  const fmt = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  const fmtNum = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const fmtPct = (v: number) => `${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const fmtByCategory = (c: GoalCategory | undefined, v: number) => {
    const t = c?.metric_type;
    if (t === "count") return fmtNum(v);
    if (t === "ratio") return fmtPct(v);
    return fmt(v);
  };
  const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const pctColor = (pct: number, lte: boolean) => {
    if (lte) {
      if (pct <= 100) return "text-emerald-600";
      if (pct <= 120) return "text-amber-500";
      return "text-rose-500";
    }
    if (pct >= 100) return "text-emerald-600";
    if (pct >= 70) return "text-amber-500";
    return "text-rose-500";
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="year">Ano inteiro</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Comparar até</Label>
              <Select value={compareMode} onValueChange={(v) => setCompareMode(v as CompareMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_date">Até hoje (parcial)</SelectItem>
                  <SelectItem value="full">Período completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Escopo</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="user">Vendedor</SelectItem>
                  <SelectItem value="campaign">Campanha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(["sales", "cs", "campaign", "financial"] as const).map((a) => {
                    const items = categories.filter((c) => c.area === a);
                    if (!items.length) return null;
                    return (
                      <div key={a}>
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{AREA_LABELS[a]}</div>
                        {items.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Equipe</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Vendedor</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Campanha</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 md:col-span-3 lg:col-span-3">
              <Label className="text-xs">Meta (obrigatório para comparar)</Label>
              <Select value={goalId} onValueChange={setGoalId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas (agregado pelos filtros acima)</SelectItem>
                  {goals.map((g) => {
                    const cat = categories.find((c) => c.id === g.category_id);
                    const team = teams.find((t) => t.id === g.team_id);
                    const prof = profiles.find((p) => p.user_id === g.user_id);
                    const camp = campaigns.find((c) => c.id === g.campaign_id);
                    const who = prof?.full_name || team?.name || camp?.name || (g.scope === "company" ? "Empresa" : g.scope);
                    const ps = parseDateBR(g.period_start).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
                    const pe = parseDateBR(g.period_end).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
                    return (
                      <SelectItem key={g.id} value={g.id}>
                        {(cat?.name || "—")} · {who} · {ps}→{pe}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {period === "custom" && (
              <>

                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* Selos de contexto */}
          <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
            <Badge variant="outline">Janela: {fmtDate(effectiveWindow.from)} → {fmtDate(effectiveWindow.to)}</Badge>
            <Badge variant="outline">
              Base Metabase: {maxCapture ? `até ${new Date(maxCapture).toLocaleDateString("pt-BR")}` : "sem capturas"}
            </Badge>
            {compareMode === "to_date" && (
              <Badge variant="secondary">Meta rateada até a captura mais recente</Badge>
            )}
            {missingMonthsInWindow.length > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-600">
                Sem dados no Metabase para: {missingMonthsInWindow.join(", ")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI resumo */}
      {(() => {
        const selectedCat = selectedGoal?.category_id
          ? categories.find((c) => c.id === selectedGoal.category_id)
          : (categoryId !== "all" ? categories.find((c) => c.id === categoryId) : undefined);
        const kpiFmt = (v: number) => (selectedCat ? fmtByCategory(selectedCat, v) : fmt(v));
        const yTickFmt = (v: number) => {
          if (selectedCat?.metric_type === "count") return fmtNum(v);
          if (selectedCat?.metric_type === "ratio") return `${v.toFixed(0)}%`;
          return `R$ ${(v / 1000).toFixed(0)}k`;
        };
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-primary/40"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Meta do Período</p>
                <p className="text-2xl font-bold">{kpiFmt(totalPeriodTarget)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {goalId === "all" ? `${filteredGoals.length} meta(s) somada(s)` : "Meta selecionada"}
                </p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Meta Rateada (YtD)</p>
                <p className="text-2xl font-bold text-muted-foreground">{kpiFmt(totalTarget)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">referência p/ gráfico mensal</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Realizado (Metabase)</p>
                <p className="text-2xl font-bold text-primary">{kpiFmt(totalRealized)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">% Atingido (vs Meta)</p>
                <p className={`text-2xl font-bold ${pctColor(totalPct, false)}`}>{totalPct.toFixed(1)}%</p>
              </CardContent></Card>
            </div>

            {/* Gráfico */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Realizado vs Meta — {year}</CardTitle>
                  <Select value={chartType} onValueChange={(v) => setChartType(v as "bar" | "line")}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Tipo de gráfico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Barras</SelectItem>
                      <SelectItem value="line">Linhas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer>
                    {chartType === "bar" ? (
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={yTickFmt} />
                        <Tooltip formatter={(v: number) => kpiFmt(v)} />
                        <Legend />

                        <Bar dataKey="Meta" fill="hsl(var(--muted-foreground))" />
                        <Bar dataKey="Realizado" fill="hsl(var(--primary))" />
                      </BarChart>
                    ) : (
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={yTickFmt} />
                        <Tooltip formatter={(v: number) => kpiFmt(v)} />
                        <Legend />

                        <Line type="monotone" dataKey="Meta" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Realizado" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        );
      })()}

      {/* Tabela pivot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metas por categoria × mês</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Categoria</TableHead>
                {monthList.map((_, idx) => (
                  <TableHead key={idx} colSpan={3} className={`text-center border-l ${!monthInWindow(idx) ? "bg-muted/30 text-muted-foreground" : ""}`}>{MONTHS[idx]}</TableHead>
                ))}
                <TableHead colSpan={3} className="text-center border-l bg-muted/50">YTD</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10" />
                {monthList.map((_, idx) => (
                  <Fragment key={`head-month-${idx}`}>
                    <TableHead className={`text-right text-[10px] border-l ${!monthInWindow(idx) ? "bg-muted/30" : ""}`}>Meta</TableHead>
                    <TableHead className={`text-right text-[10px] ${!monthInWindow(idx) ? "bg-muted/30" : ""}`}>Real.</TableHead>
                    <TableHead className={`text-right text-[10px] ${!monthInWindow(idx) ? "bg-muted/30" : ""}`}>%</TableHead>
                  </Fragment>
                ))}
                <TableHead className="text-right text-[10px] border-l bg-muted/50">Meta</TableHead>
                <TableHead className="text-right text-[10px] bg-muted/50">Real.</TableHead>
                <TableHead className="text-right text-[10px] bg-muted/50">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoriesForTable.map((c) => {
                const lte = isBetterBelow(c.goal_direction);
                let ytdT = 0, ytdR = 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{c.name}</span>
                        <Badge variant="outline" className="text-[9px]">{AREA_LABELS[c.area]}</Badge>
                      </div>
                    </TableCell>
                    {monthList.map((_, idx) => {
                      const t = targetByCatMonth.get(`${c.id}|${idx}`) || 0;
                      const r = realizedByCatMonth.get(`${c.id}|${idx}`) || 0;
                      const pct = t > 0 ? (r / t) * 100 : 0;
                      ytdT += t; ytdR += r;
                      const dim = !monthInWindow(idx) ? "bg-muted/20 text-muted-foreground" : "";
                      return (
                        <Fragment key={`cell-month-${idx}`}>
                          <TableCell className={`text-right text-xs border-l ${dim}`}>{t > 0 ? fmtByCategory(c, t) : "—"}</TableCell>
                          <TableCell className={`text-right text-xs ${dim}`}>{r > 0 ? fmtByCategory(c, r) : "—"}</TableCell>
                          <TableCell className={`text-right text-xs font-semibold ${dim} ${t > 0 && monthInWindow(idx) ? pctColor(pct, lte) : "text-muted-foreground"}`}>
                            {t > 0 ? `${pct.toFixed(0)}%` : "—"}
                          </TableCell>
                        </Fragment>
                      );
                    })}
                    <TableCell className="text-right text-xs border-l bg-muted/30">{fmtByCategory(c, ytdT)}</TableCell>
                    <TableCell className="text-right text-xs bg-muted/30">{fmtByCategory(c, ytdR)}</TableCell>
                    <TableCell className={`text-right text-xs font-semibold bg-muted/30 ${ytdT > 0 ? pctColor(ytdT > 0 ? (ytdR / ytdT) * 100 : 0, lte) : "text-muted-foreground"}`}>
                      {ytdT > 0 ? `${((ytdR / ytdT) * 100).toFixed(0)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {categoriesForTable.length === 0 && (
                <TableRow><TableCell colSpan={40} className="text-center text-muted-foreground py-6">Nenhuma categoria cadastrada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!hasAggData && !loading && (
        <Card>
          <CardHeader><CardTitle className="text-base">Aguardando dados do Metabase</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Nenhum dado foi ingerido ainda. O agente do Claude Code deve enviar capturas diárias via <code>POST</code> para a Edge Function <code>metabase-ingest</code>.</p>
            <p>Cabeçalho de autenticação: <code>x-cron-secret: $CRON_SECRET</code></p>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">{`{
  "capture_date": "2026-07-27",
  "rows": [
    {
      "metric_key": "new_mrr",
      "scope": "user",
      "user_id": "<uuid>",
      "area": "sales",
      "category_id": "<uuid opcional>",
      "amount": 12500,
      "deals_count": 5,
      "source_url": "https://metabase..."
    }
  ]
}`}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
