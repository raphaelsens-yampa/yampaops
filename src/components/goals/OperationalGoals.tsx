import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isBetterBelow } from "@/lib/goalCategories";
import { useDb } from "@/integrations/dbContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TvLinksDialog } from "./TvLinksDialog";
import { toBRDateKey, weeksOfMonth } from "./tactical/types";
import { useCategoryWeeklyData } from "./tactical/useCategoryWeeklyData";
import { buildOperationalPeriodModel } from "./operationalGoalsModel";
import { OperationalMonthReport } from "./OperationalMonthReport";

type OperationalArea = "sales" | "cs";

const NORTH_STAR: Record<OperationalArea, { slug: string; team: string; label: string; help: string }> = {
  sales: {
    slug: "mrr_increase",
    team: "Time de Vendas",
    label: "New MRR",
    help: "Soma novas vendas, recuperações de churn e upsell.",
  },
  cs: {
    slug: "mrr_decrease",
    team: "Time de CS",
    label: "Churn MRR",
    help: "Soma churns e downsell. Quanto menor, melhor.",
  },
};

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function clampProgress(realized: number | null, target: number): number {
  if (realized === null || target <= 0) return 0;
  return Math.min((realized / target) * 100, 100);
}

export function OperationalGoals({ tvArea }: { tvArea?: OperationalArea } = {}) {
  const { canView, role, user } = useAuth();
  const canEditSalesRef = !tvArea && (user?.email ?? "").toLowerCase() === "raphael@yampa.com.br";
  const supabase = useDb();
  const canViewSales = tvArea ? tvArea === "sales" : canView("goals_operational_sales");
  const canViewCs = tvArea ? tvArea === "cs" : canView("goals_operational_cs");
  const allowedAreas = useMemo(
    () => ([canViewSales && "sales", canViewCs && "cs"].filter(Boolean) as OperationalArea[]),
    [canViewSales, canViewCs],
  );
  const realToday = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const [area, setArea] = useState<OperationalArea>(allowedAreas[0] ?? "sales");
  const [refMonth, setRefMonth] = useState(() => new Date(realToday.getFullYear(), realToday.getMonth(), 1));
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(toBRDateKey(realToday));
  const refMonthKey = toBRDateKey(new Date(refMonth.getFullYear(), refMonth.getMonth(), 1));
  const [salesRefPct, setSalesRefPct] = useState<number | null>(null);
  const [refReloadKey, setRefReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .from("operational_goal_overrides")
      .select("growth_pct")
      .eq("area", "sales")
      .eq("year_month", refMonthKey)
      .maybeSingle()
      .then(({ data }: { data: { growth_pct: number } | null }) => {
        if (!cancelled) setSalesRefPct(data ? Number(data.growth_pct) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [refMonthKey, supabase, refReloadKey]);
  const { categories, targets, series, actualSnapshotDate, loading } = useCategoryWeeklyData(
    refMonth, 0, "all", false, "all", area === "sales" ? salesRefPct : null,
  );
  const [monthlyRealized, setMonthlyRealized] = useState<Map<string, number>>(new Map());
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  useEffect(() => {
    if (!allowedAreas.includes(area) && allowedAreas[0]) setArea(allowedAreas[0]);
  }, [allowedAreas, area]);

  const monthStart = useMemo(() => new Date(refMonth.getFullYear(), refMonth.getMonth(), 1), [refMonth]);
  const monthEnd = useMemo(() => new Date(refMonth.getFullYear(), refMonth.getMonth() + 1, 0), [refMonth]);
  const monthStartKey = toBRDateKey(monthStart);
  const monthEndKey = toBRDateKey(monthEnd);
  const todayKey = toBRDateKey(realToday);
  const asOfKey = monthEndKey < todayKey ? monthEndKey : todayKey < monthStartKey ? monthStartKey : todayKey;
  const weeks = useMemo(() => weeksOfMonth(refMonth), [refMonth]);
  const revisedWeeklyTargets = useMemo(() => {
    try {
      return localStorage.getItem("category-weekly-goals-revised") !== "0";
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMonthlyLoading(true);
    supabase
      .from("metabase_monthly_agg")
      .select("category_id, realized_amount")
      .eq("year_month", monthStartKey)
      .eq("scope", "company")
      .is("team_id", null)
      .is("user_id", null)
      .is("campaign_id", null)
      .then(({ data }) => {
        if (cancelled) return;
        const next = new Map<string, number>();
        ((data as Array<{ category_id: string | null; realized_amount: number | null }>) || []).forEach((row) => {
          if (!row.category_id) return;
          next.set(row.category_id, (next.get(row.category_id) ?? 0) + Number(row.realized_amount || 0));
        });
        setMonthlyRealized(next);
        setMonthlyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthStartKey, supabase]);

  useEffect(() => {
    const currentIndex = weeks.findIndex((week) => {
      const start = toBRDateKey(week.start);
      const end = toBRDateKey(week.end);
      return asOfKey >= start && asOfKey <= end;
    });
    const nextIndex = currentIndex >= 0 ? currentIndex : Math.max(0, weeks.length - 1);
    setSelectedWeek(nextIndex);
    const nextDay = asOfKey >= monthStartKey && asOfKey <= monthEndKey ? asOfKey : monthStartKey;
    setSelectedDay(nextDay);
  }, [asOfKey, monthStartKey, monthEndKey, weeks]);

  const model = useMemo(() => {
    const config = NORTH_STAR[area];
    const aggregate = categories.find((category) => category.slug === config.slug);
    if (!aggregate) return null;
    const monthTarget = targets.get(aggregate.id) ?? 0;
    const week = weeks[selectedWeek] ?? weeks[0];
    const lowerIsBetter = isBetterBelow(aggregate.goal_direction);
    const asOf = new Date(`${asOfKey}T00:00:00`);
    const period = buildOperationalPeriodModel({
      slug: config.slug as "mrr_increase" | "mrr_decrease",
      categories,
      series,
      weeks,
      monthStart,
      monthEnd,
      asOf,
      selectedDay,
      monthTarget,
      lowerIsBetter,
      revisedWeeklyTargets,
    });
    const canonicalMonthValues = (aggregate.component_category_ids ?? [])
      .map((id) => monthlyRealized.get(id))
      .filter((value): value is number => value !== undefined);
    const canonicalMonthRealized = canonicalMonthValues.length
      ? canonicalMonthValues.reduce((sum, value) => sum + value, 0)
      : null;

    return {
      config,
      aggregate,
      monthTarget,
      monthRealized: canonicalMonthRealized,
      week,
      weekTarget: period.weeklyTargets[selectedWeek] ?? 0,
      weekRealized: period.weeklyRealized[selectedWeek] ?? null,
      dayTarget: period.dayTarget,
      dayRealized: period.dayRealized,
      lowerIsBetter,
    };
  }, [area, categories, targets, series, monthlyRealized, monthStart, monthEnd, asOfKey, weeks, selectedWeek, selectedDay, revisedWeeklyTargets]);

  if (!allowedAreas.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Seu nível de acesso não permite visualizar os placares operacionais.
        </CardContent>
      </Card>
    );
  }

  if (loading || monthlyLoading || !model) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Carregando placar...</p>;
  }

  const monthPct = model.monthTarget > 0 && model.monthRealized !== null
    ? (model.monthRealized / model.monthTarget) * 100
    : null;
  const monthBalance = model.monthRealized === null
    ? null
    : model.lowerIsBetter
      ? model.monthTarget - model.monthRealized
      : model.monthRealized - model.monthTarget;
  const monthStatus = model.monthRealized === null || model.monthTarget <= 0
    ? "Sem dados"
    : monthEndKey < todayKey
      ? Math.abs(model.monthRealized - model.monthTarget) <= model.monthTarget * 0.02 ? "Atingido"
        : model.monthRealized > model.monthTarget ? "Acima" : "Abaixo"
      : model.lowerIsBetter
        ? model.monthRealized <= model.monthTarget ? "Sob controle" : "Acima do limite"
        : model.monthRealized >= model.monthTarget ? "Meta atingida" : "Em andamento";
  const maxDay = monthEndKey < todayKey ? monthEndKey : todayKey;

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-3xl">
        <Card className="overflow-hidden rounded-lg">
          <CardHeader className="space-y-4 border-b px-4 pb-3 pt-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Metas Operacionais</p>
                <h2 className="font-heading text-xl font-bold capitalize">{format(refMonth, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
              </div>
              {tvArea ? (
                <span className="text-xs text-muted-foreground">Atualiza a cada 5 min</span>
              ) : (
              <div className="flex items-center gap-1">
                {role === "admin" && <TvLinksDialog />}
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês anterior" onClick={() => setRefMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Próximo mês" disabled={monthEndKey >= todayKey} onClick={() => setRefMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              )}
            </div>
            {allowedAreas.length > 1 && (
              <div className="flex gap-5" role="tablist" aria-label="Placar por time">
                {allowedAreas.map((item) => (
                  <Button key={item} variant="ghost" size="sm" onClick={() => setArea(item)} className={cn("h-9 rounded-none border-b-2 px-1", area === item ? "border-accent text-foreground" : "border-transparent text-muted-foreground")}>
                    {item === "sales" ? "Sales" : "CS"}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-8 p-4 sm:p-6">
            <section>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={cn("h-9 w-2 rounded-sm", area === "sales" ? "bg-accent" : "bg-primary")} />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{model.config.team}</p>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-heading text-lg font-bold">{model.config.label}</h3>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Como o ${model.config.label} é calculado`}><Info className="h-3.5 w-3.5" /></Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">{model.config.help}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
                <span className={cn("rounded-sm px-2 py-1 text-xs font-semibold", monthStatus === "Acima do limite" || (monthStatus === "Acima" && model.lowerIsBetter) || (monthStatus === "Abaixo" && !model.lowerIsBetter) ? "bg-destructive/10 text-destructive" : monthStatus === "Em andamento" ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>
                  {monthStatus}
                </span>
              </div>

              <div className="ml-4 space-y-7 border-l-2 border-muted pl-5 sm:pl-7">
                <div className="relative">
                  <span className={cn("absolute -left-[27px] top-7 h-3 w-3 rounded-full border-2 bg-card sm:-left-[35px]", area === "sales" ? "border-accent" : "border-primary")} />
                  <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Mês</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Meta</p>
                      <p className="font-heading text-xl font-bold sm:text-2xl">{model.monthTarget > 0 ? formatMoney(model.monthTarget) : "Não cadastrada"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Realizado</p>
                      <p className="font-heading text-xl font-bold sm:text-2xl">{formatMoney(model.monthRealized)}</p>
                    </div>
                  </div>
                   <Progress value={clampProgress(model.monthRealized, model.monthTarget)} className={cn("mt-4 h-2", model.lowerIsBetter && "[&>div]:bg-warning")} />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{monthPct === null ? "Sem percentual" : `${monthPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do ${model.lowerIsBetter ? "limite" : "objetivo"}`}</span>
                    <span>{monthBalance === null ? "Saldo indisponível" : `${model.lowerIsBetter ? "Margem" : "Saldo"}: ${formatMoney(Math.abs(monthBalance))}`}</span>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute -left-[26px] top-6 h-2 w-2 rounded-full bg-muted-foreground/40 sm:-left-[34px]" />
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Semana</p>
                      <p className="text-sm font-medium">{model.week?.rangeLabel ?? "—"}</p>
                    </div>
                    <Select value={String(selectedWeek)} onValueChange={(value) => setSelectedWeek(Number(value))}>
                      <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{weeks.map((week, index) => <SelectItem key={week.index} value={String(index)}>{week.label} · {week.rangeLabel}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <div><p className="text-[10px] uppercase text-muted-foreground">Meta</p><p className="font-heading font-bold">{formatMoney(model.weekTarget)}</p></div>
                    <div className="text-right"><p className="text-[10px] uppercase text-muted-foreground">Realizado</p><p className="font-heading font-bold">{formatMoney(model.weekRealized)}</p></div>
                  </div>
                   <Progress value={clampProgress(model.weekRealized, model.weekTarget)} className={cn("mt-3 h-1.5", model.lowerIsBetter && "[&>div]:bg-warning")} />
                </div>

                <div className="rounded-md bg-muted/55 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <Input type="date" value={selectedDay} min={monthStartKey} max={maxDay} onChange={(event) => setSelectedDay(event.target.value)} className="h-9 w-40 bg-card" />
                    </div>
                    <div className="grid grid-cols-2 gap-5 text-right">
                      <div><p className="text-[10px] uppercase text-muted-foreground">Meta do dia</p><p className="text-sm font-bold">{formatMoney(model.dayTarget)}</p></div>
                      <div><p className="text-[10px] uppercase text-muted-foreground">Realizado</p><p className="text-sm font-bold">{formatMoney(model.dayRealized)}</p></div>
                    </div>
                  </div>
                </div>
              </div>
              {area === "sales" && (salesRefPct || canEditSalesRef) && (
                <SalesReferenceEditor
                  pct={salesRefPct}
                  editable={canEditSalesRef}
                  monthKey={refMonthKey}
                  onSaved={() => setRefReloadKey((k) => k + 1)}
                />
              )}
            </section>
          </CardContent>
          <div className="flex items-center justify-between border-t bg-muted/35 px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <span>{actualSnapshotDate ? `Base conferida em ${actualSnapshotDate.split("-").reverse().join("/")}` : "Base diária indisponível"}</span>
            <span className="flex items-center gap-2 font-semibold text-foreground"><span className="h-2 w-2 rounded-full bg-accent" />Dados consolidados</span>
          </div>
        </Card>
      </div>
      {!tvArea && <OperationalMonthReport area={area} monthStartKey={monthStartKey} monthEndKey={monthEndKey} officialTotal={model.monthRealized} />}
    </TooltipProvider>
  );
}
function SalesReferenceEditor({ pct, editable, monthKey, onSaved }: { pct: number | null; editable: boolean; monthKey: string; onSaved: () => void }) {
  const { user } = useAuth();
  const [value, setValue] = useState(pct ? String(pct).replace(".", ",") : "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(pct ? String(pct).replace(".", ",") : ""), [pct]);

  const save = async (next: number | null) => {
    setSaving(true);
    const table = (supabase as any).from("operational_goal_overrides");
    const { error } = next === null
      ? await table.delete().eq("area", "sales").eq("year_month", monthKey)
      : await table.upsert({ area: "sales", year_month: monthKey, growth_pct: next, updated_by: user?.id }, { onConflict: "area,year_month" });
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a meta de referência");
    toast.success(next === null ? "Voltou para a meta cadastrada" : "Meta de referência atualizada");
    onSaved();
  };

  const label = pct ? `Meta de referência: ${pct.toLocaleString("pt-BR")}% a.m.` : "Meta cadastrada (padrão)";
  if (!editable) return <p className="mt-5 text-xs text-muted-foreground">{label}</p>;

  const parsed = Number(value.replace(",", "."));
  const valid = isFinite(parsed) && parsed > 0 && parsed <= 100;
  return (
    <div className="mt-6 flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: 5" inputMode="decimal" className="h-8 w-20 text-right" aria-label="Crescimento % ao mês" />
        <span className="text-xs text-muted-foreground">% a.m.</span>
        <Button size="sm" className="h-8" disabled={!valid || saving} onClick={() => save(parsed)}>Aplicar</Button>
        {pct !== null && <Button size="sm" variant="ghost" className="h-8" disabled={saving} onClick={() => save(null)}>Usar padrão</Button>}
      </div>
    </div>
  );
}
