import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { AREA_LABELS, isBetterBelow, type GoalCategory } from "@/lib/goalCategories";
import { parseDateBR, parseDateBRStart, parseDateBREnd } from "@/lib/dateBR";
import { computeRevisedTargets } from "@/lib/revisedGoals";

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw, ChevronDown } from "lucide-react";

type Period = "day" | "week" | "month" | "custom" | "year";
type CompareMode = "to_date" | "full";
type ProductScope = "yampafin" | "yampa20" | "all";

/**
 * Conta Stripe "yampa 2.0" — operação separada, com apenas duas métricas:
 * MRR e Ativos Pagantes. As categorias abaixo NUNCA são renderizadas como
 * linha própria: são consumidas apenas pelo recorte de Produto, remapeadas
 * para as categorias equivalentes do yampaFin.
 */
const YAMPA20_MRR_CAT = "736013b8-a8d9-4cb7-9853-116278e00a6d";
const YAMPA20_ACTIVE_CAT = "4f7772b8-1dcd-4e92-89bc-23fac2a57fa2";
const BASE_MRR_CAT = "9bf2da79-f47f-4215-b841-bbb3e91ee036";
const BASE_ACTIVE_CAT = "b70ca504-9f35-40b6-807b-e830c6342ac7";
/** category_id do 2.0 → category_id equivalente no yampaFin */
const YAMPA20_TO_BASE: Record<string, string> = {
  [YAMPA20_MRR_CAT]: BASE_MRR_CAT,
  [YAMPA20_ACTIVE_CAT]: BASE_ACTIVE_CAT,
};
const YAMPA20_CATEGORY_IDS = new Set([YAMPA20_MRR_CAT, YAMPA20_ACTIVE_CAT]);
/** Categorias que existem no recorte "yampa 2.0" (as demais não existem: exibem "—") */
const YAMPA20_AVAILABLE_BASE_IDS = new Set([BASE_MRR_CAT, BASE_ACTIVE_CAT]);
const PRODUCT_LABELS: Record<ProductScope, string> = {
  yampafin: "yampaFin",
  yampa20: "yampa 2.0",
  all: "Todos",
};
const YAMPA20_SCOPE_NOTE =
  "A conta yampa 2.0 possui apenas MRR e Ativos Pagantes. As demais métricas refletem somente yampaFin.";

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
  target_deals?: number | null;
  target_tpv?: number | null;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Valor da meta independente do tipo de métrica da categoria.
 * Categorias de quantidade/razão são cadastradas em target_deals (ou target_tpv),
 * então usamos o primeiro campo preenchido.
 */
function goalTargetValue(g: Goal): number {
  const mrr = Number(g.target_mrr || 0);
  if (mrr) return mrr;
  const deals = Number(g.target_deals || 0);
  if (deals) return deals;
  return Number(g.target_tpv || 0);
}

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
  // Data de referência (permite olhar dias/semanas/meses anteriores)
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [refDate, setRefDate] = useState<string>(todayKey);
  const refDay = useMemo(() => parseDateBRStart(refDate) , [refDate]);
  const [compareMode, setCompareMode] = useState<CompareMode>("to_date");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [kpiView, setKpiView] = useState<"month" | "period">("month");
  const GOAL_MODE_KEY = "metabase_goal_mode_v1";
  const [goalMode, setGoalMode] = useState<"original" | "revised">(() => {
    try {
      return localStorage.getItem(GOAL_MODE_KEY) === "revised" ? "revised" : "original";
    } catch {
      return "original";
    }
  });
  const changeGoalMode = (m: "original" | "revised") => {
    setGoalMode(m);
    try { localStorage.setItem(GOAL_MODE_KEY, m); } catch {}
  };



  const [productScope, setProductScope] = useState<ProductScope>("yampafin");
  const [scope, setScope] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [teamId, setTeamId] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [campaignId, setCampaignId] = useState<string>("all");
  const categoryDefaultSet = useRef(false);

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
      // As categorias do 2.0 nunca entram na lista: são tratadas só pelo recorte de Produto
      setCategories((((cRes.data as GoalCategory[]) || []).filter((c) => !YAMPA20_CATEGORY_IDS.has(c.id))));
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

  // Ao carregar as categorias, pré-seleciona "Total de MRR" como padrão
  useEffect(() => {
    if (categoryDefaultSet.current) return;
    if (!categories.length) return;
    const totalMRR = categories.find((c) => c.name === "Total de MRR");
    if (totalMRR) {
      setCategoryId(totalMRR.id);
      categoryDefaultSet.current = true;
    }
  }, [categories]);

  /**
   * Recorte por produto aplicado na LEITURA (nada muda no banco):
   * - yampafin: descarta as linhas da conta 2.0 (comportamento original)
   * - all: remapeia as linhas do 2.0 para a categoria equivalente → soma em cima do yampaFin
   * - yampa20: mantém SOMENTE as linhas do 2.0, já remapeadas
   * MRR e Ativos Pagantes são estoque — a soma aqui é entre contas no MESMO mês, nunca entre meses.
   */
  const scopedAgg = useMemo(() => {
    if (productScope === "yampafin") {
      return agg.filter((r) => !r.category_id || !YAMPA20_CATEGORY_IDS.has(r.category_id));
    }
    if (productScope === "yampa20") {
      return agg
        .filter((r) => r.category_id && YAMPA20_CATEGORY_IDS.has(r.category_id))
        .map((r) => ({ ...r, category_id: YAMPA20_TO_BASE[r.category_id!] }));
    }
    return agg.map((r) =>
      r.category_id && YAMPA20_CATEGORY_IDS.has(r.category_id)
        ? { ...r, category_id: YAMPA20_TO_BASE[r.category_id] }
        : r,
    );
  }, [agg, productScope]);

  /** No recorte 2.0 a métrica simplesmente não existe → renderiza "—", nunca 0 */
  const isUnavailableCategory = (id: string) =>
    productScope === "yampa20" && !YAMPA20_AVAILABLE_BASE_IDS.has(id);


  const scopedFilter = (r: { scope: string; team_id: string | null; user_id: string | null; campaign_id: string | null; category_id: string | null }) => {
    if (scope !== "all" && r.scope !== scope) return false;
    if (categoryId !== "all" && r.category_id !== categoryId) return false;
    if (teamId !== "all" && r.team_id !== teamId) return false;
    if (userId !== "all" && r.user_id !== userId) return false;
    if (campaignId !== "all" && r.campaign_id !== campaignId) return false;
    return true;
  };

  const filteredGoals = useMemo(() => {
    return goals.filter((g) => scopedFilter({ ...g }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, scope, categoryId, teamId, userId, campaignId]);

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

  // Janela efetiva do filtro Período (ancorada na Data de referência)
  const windowRange = useMemo(() => {
    const ref = isNaN(refDay.getTime()) ? new Date() : new Date(refDay);
    const refEnd = new Date(ref); refEnd.setHours(23, 59, 59, 999);
    if (period === "day") {
      const s = new Date(ref); s.setHours(0, 0, 0, 0);
      return { from: s, to: refEnd };
    }
    if (period === "week") return { from: startOfWeek(ref), to: endOfWeek(ref) };
    if (period === "month") {
      const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: s, to: e };
    }
    if (period === "custom") {
      const s = new Date(customFrom + "T00:00:00");
      const e = new Date(customTo + "T23:59:59");
      return { from: s, to: e };
    }
    // year
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999) };
  }, [period, customFrom, customTo, year, refDay]);

  // Cap superior "Comparar até": limita meta ao min(windowRange.to, data de referência, últimoMêsCapturado+fim)
  const effectiveWindow = useMemo(() => {
    if (compareMode === "full") return windowRange;
    const ref = isNaN(refDay.getTime()) ? new Date() : new Date(refDay);
    ref.setHours(23, 59, 59, 999);
    let cap = ref < windowRange.to ? ref : windowRange.to;
    if (maxCapture) {
      const [y, m] = maxCapture.split("-").map(Number);
      const capMonthEnd = new Date(y, m, 0, 23, 59, 59, 999); // last day of that month
      if (capMonthEnd < cap) cap = capMonthEnd;
    }
    return { from: windowRange.from, to: cap < windowRange.from ? windowRange.from : cap };
  }, [windowRange, compareMode, maxCapture, refDay]);

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
    // Seleção explícita por filtro — mostra apenas aquela categoria
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
  }, [categories, categoryId, allowedCategoryIds, filteredGoals, virtualComponents]);

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
  }, [agg, scope, categoryId, teamId, userId, campaignId, year, compareWindow, allowedCategoryIds, componentToVirtuals]);

  // Target per (category, month) — meta cheia por mês (para tabela e gráfico mensal)
  const targetByCatMonth = useMemo(() => {
    const map = new Map<string, number>();
    filteredGoals.forEach((g) => {
      monthList.forEach((mStart, idx) => {
        const mEnd = new Date(year, idx + 1, 0, 23, 59, 59, 999);
        const frac = targetFraction(g.period_start, g.period_end, mStart, mEnd);
        if (frac <= 0) return;
        const key = `${g.category_id || "none"}|${idx}`;
        map.set(key, (map.get(key) || 0) + goalTargetValue(g) * frac);
      });
    });
    return map;
  }, [filteredGoals, monthList, year]);

  // ===== Tabela pivot: dados INDEPENDENTES dos filtros de cima =====
  const TABLE_ORDER_KEY = "metabase_table_order_v1";
  const [tableOrder, setTableOrder] = useState<string[]>([]);
  const tableOrderLoadedRef = useRef(false);

  useEffect(() => {
    if (tableOrderLoadedRef.current) return;
    try {
      const raw = localStorage.getItem(TABLE_ORDER_KEY);
      if (raw) setTableOrder(JSON.parse(raw));
    } catch {}
    tableOrderLoadedRef.current = true;
  }, []);

  const defaultTableOrder = useMemo(() => {
    const total = categories.find((c) => c.name === "Total de MRR");
    const net = categories.find((c) => c.name === "Net MRR");
    const head: string[] = [];
    if (total) head.push(total.id);
    if (net) head.push(net.id);
    const rest = categories.filter((c) => !head.includes(c.id)).map((c) => c.id);
    return [...head, ...rest];
  }, [categories]);

  const tableCategories = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const savedValid = tableOrder.filter((id) => byId.has(id));
    const merged = [...savedValid, ...defaultTableOrder.filter((id) => !savedValid.includes(id))];
    return merged.map((id) => byId.get(id)!).filter(Boolean);
  }, [categories, tableOrder, defaultTableOrder]);

  const tableRealizedByCatMonth = useMemo(() => {
    const map = new Map<string, number>();
    const addTo = (catId: string, mIdx: number, val: number) => {
      const key = `${catId}|${mIdx}`;
      map.set(key, (map.get(key) || 0) + val);
    };
    agg.forEach((r) => {
      const d = parseDateBR(r.year_month);
      if (d.getFullYear() !== year) return;
      const v = Number(r.realized_amount || 0);
      const catId = r.category_id || "none";
      addTo(catId, d.getMonth(), v);
      const virtuals = componentToVirtuals.get(catId);
      if (virtuals) virtuals.forEach((vId) => addTo(vId, d.getMonth(), v));
    });
    return map;
  }, [agg, year, componentToVirtuals]);

  const tableTargetByCatMonth = useMemo(() => {
    const map = new Map<string, number>();
    goals.forEach((g) => {
      monthList.forEach((mStart, idx) => {
        const mEnd = new Date(year, idx + 1, 0, 23, 59, 59, 999);
        const frac = targetFraction(g.period_start, g.period_end, mStart, mEnd);
        if (frac <= 0) return;
        const key = `${g.category_id || "none"}|${idx}`;
        map.set(key, (map.get(key) || 0) + goalTargetValue(g) * frac);
      });
    });
    return map;
  }, [goals, monthList, year]);

  // ===== Meta Revisada — déficit dos meses encerrados diluído no restante do trimestre =====
  const refYear = isNaN(refDay.getTime()) ? now.getFullYear() : refDay.getFullYear();
  const refMonth = isNaN(refDay.getTime()) ? now.getMonth() : refDay.getMonth();
  const closedBeforeIdx = year < refYear ? 12 : year > refYear ? 0 : refMonth;
  const lowerIsBetterFor = useMemo(() => {
    const dir = new Map(categories.map((c) => [c.id, isBetterBelow(c.goal_direction)]));
    return (id: string) => dir.get(id) ?? false;
  }, [categories]);

  const revised = useMemo(
    () =>
      computeRevisedTargets({
        targetByCatMonth,
        realizedByCatMonth,
        categoryIds: categoriesForTable.map((c) => c.id),
        currentMonthIdx: closedBeforeIdx,
        lowerIsBetter: lowerIsBetterFor,
      }),
    [targetByCatMonth, realizedByCatMonth, categoriesForTable, closedBeforeIdx, lowerIsBetterFor],
  );

  const tableRevised = useMemo(
    () =>
      computeRevisedTargets({
        targetByCatMonth: tableTargetByCatMonth,
        realizedByCatMonth: tableRealizedByCatMonth,
        categoryIds: categories.map((c) => c.id),
        currentMonthIdx: closedBeforeIdx,
        lowerIsBetter: lowerIsBetterFor,
      }),
    [tableTargetByCatMonth, tableRealizedByCatMonth, categories, closedBeforeIdx, lowerIsBetterFor],
  );


  const persistTableOrder = (ids: string[]) => {
    setTableOrder(ids);
    try { localStorage.setItem(TABLE_ORDER_KEY, JSON.stringify(ids)); } catch {}
  };

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleTableDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = tableCategories.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    persistTableOrder(arrayMove(ids, from, to));
  };

  const resetTableOrder = () => {
    setTableOrder([]);
    try { localStorage.removeItem(TABLE_ORDER_KEY); } catch {}
  };

  // Meta do Período — soma total das metas selecionadas cujo intervalo intersecta a janela (SEM rateio)
  const totalPeriodTarget = useMemo(() => {
    let sum = 0;
    filteredGoals.forEach((g) => {
      const gs = parseDateBRStart(g.period_start);
      const ge = parseDateBREnd(g.period_end);
      if (overlapDays(gs, ge, windowRange.from, windowRange.to) > 0) {
        sum += goalTargetValue(g);
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
      sum += goalTargetValue(g) * (ov / gDays);
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
      let revisedTarget = 0;
      categoriesForTable.forEach((c) => {
        realized += realizedByCatMonth.get(`${c.id}|${idx}`) || 0;
        const t = targetByCatMonth.get(`${c.id}|${idx}`) || 0;
        target += t;
        revisedTarget += revised.revisedByCatMonth.get(`${c.id}|${idx}`) ?? t;
      });
      return {
        month: MONTHS[idx],
        Meta: Math.round(target),
        MetaRevisada: Math.round(revisedTarget),
        Realizado: Math.round(realized),
        inWin: monthInWindow(idx),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthList, categoriesForTable, realizedByCatMonth, targetByCatMonth, revised, compareWindow]);


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
      {/* Filtros colapsáveis */}
      <Collapsible defaultOpen>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors group">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Filtros</CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                {period !== "custom" && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Data de referência</Label>
                      {refDate !== todayKey && (
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => setRefDate(todayKey)}
                        >
                          Hoje
                        </button>
                      )}
                    </div>
                    <Input type="date" value={refDate} max={todayKey} onChange={(e) => setRefDate(e.target.value || todayKey)} />
                  </div>
                )}
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
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* KPI resumo */}
      {(() => {
        const selectedCat = categoryId !== "all" ? categories.find((c) => c.id === categoryId) : undefined;
        const kpiFmt = (v: number) => (selectedCat ? fmtByCategory(selectedCat, v) : fmt(v));
        const yTickFmt = (v: number) => {
          if (selectedCat?.metric_type === "count") return fmtNum(v);
          if (selectedCat?.metric_type === "ratio") return `${v.toFixed(0)}%`;
          return `R$ ${(v / 1000).toFixed(0)}k`;
        };
        const refBase = isNaN(refDay.getTime()) ? now : refDay;
        const currentMonthIdx = year === refBase.getFullYear() ? refBase.getMonth() : 11;
        const monthRow = chartData[currentMonthIdx];
        const revisedOn = goalMode === "revised";
        const monthOriginalTarget = monthRow?.Meta || 0;
        const monthTarget = revisedOn ? (monthRow?.MetaRevisada ?? monthOriginalTarget) : monthOriginalTarget;
        const monthRealized = monthRow?.Realizado || 0;
        const monthGap = monthTarget - monthRealized;
        const monthPct = monthTarget > 0 ? (monthRealized / monthTarget) * 100 : 0;
        const monthLabel = MONTHS[currentMonthIdx];
        const revisedDeltaInWindow = chartData.reduce(
          (s, r) => s + (r.inWin ? (r.MetaRevisada || 0) - (r.Meta || 0) : 0),
          0,
        );
        const periodTargetEff = revisedOn ? totalPeriodTarget + revisedDeltaInWindow : totalPeriodTarget;
        const periodGap = periodTargetEff - totalRealized;
        const periodPct = periodTargetEff > 0 ? (totalRealized / periodTargetEff) * 100 : 0;
        const isLessBetter = !!selectedCat && isBetterBelow(selectedCat.goal_direction);

        const gapColor = (gap: number) => {
          if (gap === 0) return "text-muted-foreground";
          if (isLessBetter) {
            return gap > 0 ? "text-emerald-600" : "text-rose-500";
          }
          return gap > 0 ? "text-rose-500" : "text-emerald-600";
        };
        const gapLabel = (gap: number) => {
          if (gap === 0) return "Na meta";
          if (isLessBetter) {
            return gap > 0 ? "Dentro da meta" : "Acima do limite";
          }
          return gap > 0 ? "Faltam" : "Acima da meta";
        };
        return (
          <>
            <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-2 sm:justify-end">
              <span className="text-xs text-muted-foreground">Meta:</span>
              <div className="inline-flex rounded-md border p-0.5 bg-muted/40">

                <Button
                  size="sm"
                  variant={goalMode === "original" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => changeGoalMode("original")}
                >
                  Original
                </Button>
                <Button
                  size="sm"
                  variant={goalMode === "revised" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => changeGoalMode("revised")}
                >
                  Revisada
                </Button>
              </div>
              <span className="text-xs text-muted-foreground sm:ml-2">Visão:</span>
              <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                <Button
                  size="sm"
                  variant={kpiView === "month" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setKpiView("month")}
                >
                  Mês vigente
                </Button>
                <Button
                  size="sm"
                  variant={kpiView === "period" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setKpiView("period")}
                >
                  Acumulado do período
                </Button>
              </div>
            </div>
            {revisedOn && (
              <p className="text-xs text-amber-600">
                Meta revisada: o déficit dos meses já encerrados é redistribuído nos meses restantes do mesmo trimestre.
                Superávit não abate metas futuras.
              </p>
            )}
            {kpiView === "month" ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <Card className="border-primary/40"><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">
                    Meta do Mês ({monthLabel})
                  </p>
                  <p className={`text-xl sm:text-2xl font-bold ${revisedOn && Math.abs(monthTarget - monthOriginalTarget) > 0.5 ? "text-amber-600" : ""}`}>
                    {kpiFmt(monthTarget)}
                  </p>
                  {revisedOn && Math.abs(monthTarget - monthOriginalTarget) > 0.5 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      original {kpiFmt(monthOriginalTarget)} · revisada pelo trimestre
                    </p>
                  )}
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Realizado do Mês</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary">{kpiFmt(monthRealized)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Saldo para Meta</p>
                  <p className={`text-xl sm:text-2xl font-bold ${gapColor(monthGap)}`}>{kpiFmt(monthGap)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{gapLabel(monthGap)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">% Atingido (vs Meta)</p>
                  <p className={`text-xl sm:text-2xl font-bold ${pctColor(monthPct, isLessBetter)}`}>{monthPct.toFixed(1)}%</p>
                </CardContent></Card>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
                <Card className="border-primary/40"><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Meta do Período</p>
                  <p className={`text-xl sm:text-2xl font-bold ${revisedOn && Math.abs(periodTargetEff - totalPeriodTarget) > 0.5 ? "text-amber-600" : ""}`}>
                    {kpiFmt(periodTargetEff)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {revisedOn && Math.abs(periodTargetEff - totalPeriodTarget) > 0.5
                      ? `original ${kpiFmt(totalPeriodTarget)}`
                      : `${filteredGoals.length} meta(s) somada(s)`}
                  </p>
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Meta Rateada (YtD)</p>
                  <p className="text-xl sm:text-2xl font-bold text-muted-foreground">{kpiFmt(totalTarget)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">referência p/ gráfico mensal</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Realizado (Metabase)</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary">{kpiFmt(totalRealized)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">Saldo para Meta</p>
                  <p className={`text-xl sm:text-2xl font-bold ${gapColor(periodGap)}`}>{kpiFmt(periodGap)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{gapLabel(periodGap)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">% Atingido (vs Meta)</p>
                  <p className={`text-xl sm:text-2xl font-bold ${pctColor(periodPct, isLessBetter)}`}>{periodPct.toFixed(1)}%</p>
                </CardContent></Card>
              </div>
            )}


            {/* Gráfico */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm sm:text-base">
                    Realizado vs Meta — {year}
                    {revisedOn && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-600 text-[10px]">+ Meta revisada</Badge>}
                  </CardTitle>
                  <Select value={chartType} onValueChange={(v) => setChartType(v as "bar" | "line")}>
                    <SelectTrigger className="h-9 w-full text-xs sm:h-8 sm:w-[140px]">
                      <SelectValue placeholder="Tipo de gráfico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Barras</SelectItem>
                      <SelectItem value="line">Linhas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 md:px-6">
                <div className="h-64 sm:h-80 w-full">
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
                        {revisedOn && (
                          <Bar dataKey="MetaRevisada" name="Meta revisada" fill="hsl(38 92% 50%)" />

                        )}
                      </BarChart>
                    ) : (
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={yTickFmt} />
                        <Tooltip formatter={(v: number) => kpiFmt(v)} />
                        <Legend />

                        <Line type="monotone" dataKey="Meta" name="Meta original" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray={revisedOn ? "5 4" : undefined} dot={{ r: 3 }} />
                        {revisedOn && (
                          <Line type="monotone" dataKey="MetaRevisada" name="Meta revisada" stroke="hsl(38 92% 50%)" strokeWidth={2.5} dot={{ r: 3 }} />
                        )}
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

      {/* Tabela pivot — sempre mostra todas as categorias, independente dos filtros acima */}
      <Card>
        <CardHeader className="px-4 md:px-6 flex flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base">
              Metas por categoria × mês
              {goalMode === "revised" && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-600 text-[10px]">Meta revisada</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Arraste as linhas para reorganizar. A ordem é salva localmente.
              {goalMode === "revised" && " Metas em âmbar herdaram o déficit dos meses anteriores do trimestre."}
              <span className="md:hidden"> Deslize a tabela na horizontal para ver todos os meses.</span>
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetTableOrder} className="gap-1 h-9 justify-start sm:justify-center">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar ordem padrão
          </Button>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 w-8" />
                <TableHead className="sticky left-8 bg-background z-10 min-w-[200px]">Categoria</TableHead>
                {monthList.map((_, idx) => (
                  <TableHead key={idx} colSpan={3} className="text-center border-l">{MONTHS[idx]}</TableHead>
                ))}
                <TableHead colSpan={3} className="text-center border-l bg-muted/50">YTD</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 w-8" />
                <TableHead className="sticky left-8 bg-background z-10" />
                {monthList.map((_, idx) => (
                  <Fragment key={`head-month-${idx}`}>
                    <TableHead className="text-right text-[10px] border-l">Meta</TableHead>
                    <TableHead className="text-right text-[10px]">Real.</TableHead>
                    <TableHead className="text-right text-[10px]">%</TableHead>
                  </Fragment>
                ))}
                <TableHead className="text-right text-[10px] border-l bg-muted/50">Meta</TableHead>
                <TableHead className="text-right text-[10px] bg-muted/50">Real.</TableHead>
                <TableHead className="text-right text-[10px] bg-muted/50">%</TableHead>
              </TableRow>
            </TableHeader>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
              <SortableContext items={tableCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <TableBody>
                  {tableCategories.map((c) => (
                    <SortableCategoryRow
                      key={c.id}
                      category={c}
                      monthList={monthList}
                      targetMap={tableTargetByCatMonth}
                      realizedMap={tableRealizedByCatMonth}
                      revisedMap={tableRevised.revisedByCatMonth}
                      showRevised={goalMode === "revised"}

                      fmt={fmtByCategory}
                      pctColor={pctColor}
                    />
                  ))}
                  {tableCategories.length === 0 && (
                    <TableRow><TableCell colSpan={40} className="text-center text-muted-foreground py-6">Nenhuma categoria cadastrada.</TableCell></TableRow>
                  )}
                </TableBody>
              </SortableContext>
            </DndContext>
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

interface SortableCategoryRowProps {
  category: GoalCategory;
  monthList: Date[];
  targetMap: Map<string, number>;
  realizedMap: Map<string, number>;
  revisedMap?: Map<string, number>;
  showRevised?: boolean;
  fmt: (c: GoalCategory | undefined, v: number) => string;
  pctColor: (pct: number, lte: boolean) => string;
}

function SortableCategoryRow({ category: c, monthList, targetMap, realizedMap, revisedMap, showRevised, fmt, pctColor }: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
  };
  const lte = isBetterBelow(c.goal_direction);
  let ytdT = 0, ytdR = 0;
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="sticky left-0 bg-background z-10 w-8 p-1 cursor-grab active:cursor-grabbing text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </TableCell>
      <TableCell className="sticky left-8 bg-background z-10 font-medium">
        <div className="flex items-center gap-2">
          <span>{c.name}</span>
          <Badge variant="outline" className="text-[9px]">{AREA_LABELS[c.area]}</Badge>
        </div>
      </TableCell>
      {monthList.map((_, idx) => {
        const original = targetMap.get(`${c.id}|${idx}`) || 0;
        const rev = revisedMap?.get(`${c.id}|${idx}`) ?? original;
        const hasRev = !!showRevised && original > 0 && Math.abs(rev - original) > 0.5;
        const t = showRevised && original > 0 ? rev : original;
        const r = realizedMap.get(`${c.id}|${idx}`) || 0;
        const pct = t > 0 ? (r / t) * 100 : 0;
        ytdT += t; ytdR += r;
        return (
          <Fragment key={`cell-month-${idx}`}>
            <TableCell className="text-right text-xs border-l">
              {t > 0 ? (
                <span className={hasRev ? "text-amber-600 font-medium" : undefined}>{fmt(c, t)}</span>
              ) : "—"}
              {hasRev && (
                <span className="block text-[9px] text-muted-foreground line-through">{fmt(c, original)}</span>
              )}
            </TableCell>
            <TableCell className="text-right text-xs">{r > 0 ? fmt(c, r) : "—"}</TableCell>
            <TableCell className={`text-right text-xs font-semibold ${t > 0 ? pctColor(pct, lte) : "text-muted-foreground"}`}>
              {t > 0 ? `${pct.toFixed(0)}%` : "—"}
            </TableCell>
          </Fragment>
        );
      })}
      <TableCell className="text-right text-xs border-l bg-muted/30">{fmt(c, ytdT)}</TableCell>
      <TableCell className="text-right text-xs bg-muted/30">{fmt(c, ytdR)}</TableCell>
      <TableCell className={`text-right text-xs font-semibold bg-muted/30 ${ytdT > 0 ? pctColor((ytdR / ytdT) * 100, lte) : "text-muted-foreground"}`}>
        {ytdT > 0 ? `${((ytdR / ytdT) * 100).toFixed(0)}%` : "—"}
      </TableCell>
    </TableRow>
  );
}

