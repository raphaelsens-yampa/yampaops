import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { dailySalesTarget, type SalesGoal } from "@/lib/operationalSalesCount";
import { useCategoryWeeklyData } from "./useCategoryWeeklyData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OriginFilter } from "@/lib/origins";
import {
  businessDayAverage, cumulative, dailySeries, daysInMonth, lastBusinessDaysPace, pessimisticPace,
  prevMonth, projectMonth, roundHalfUp, trendLine, type PacingComposition, type PacingMetric,
} from "@/lib/newMrrPacing";
import { useNewMrrPacing } from "./useNewMrrPacing";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const label = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface Props { today: Date; origin: OriginFilter; refreshKey?: number }

export function NewMrrPacingPanel({ today, origin: pageOrigin, refreshKey }: Props) {
  const todayIso = today.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const curYm = todayIso.slice(0, 7);
  const todayDay = Number(todayIso.slice(8, 10));
  const monthOptions = useMemo(() => {
    const out: string[] = [];
    let ym = curYm;
    for (let i = 0; i < 13; i++) { out.push(ym); ym = prevMonth(ym); }
    return out;
  }, [curYm]);

  const [open, setOpen] = useState(true);
  const [origin, setOrigin] = useState<OriginFilter>(pageOrigin);
  useEffect(() => { setOrigin(pageOrigin); }, [pageOrigin]);
  const [mode, setMode] = useState<"mtd" | "closed">("mtd");
  const [metric, setMetric] = useState<PacingMetric>("mrr");
  const [comp, setComp] = useState<PacingComposition>("total");
  const [view, setView] = useState<"cum" | "daily">("cum");
  const [extraMonth, setExtraMonth] = useState<string>(prevMonth(prevMonth(curYm)));
  const [monthA, setMonthA] = useState(prevMonth(curYm));
  const [monthB, setMonthB] = useState(prevMonth(prevMonth(curYm)));

  const fromDate = `${monthOptions[monthOptions.length - 1]}-01`;
  const { events, loading, error } = useNewMrrPacing(fromDate, todayIso, origin, refreshKey);

  // Meta do mês (New MRR geral) e meta diária de vendas da empresa.
  const curMonthDate = useMemo(() => new Date(`${curYm}-01T12:00:00`), [curYm]);
  const { categories: goalCats, targets: goalTargets } = useCategoryWeeklyData(curMonthDate, 0, origin, false, "all", null);
  const mrrMonthTarget = useMemo(() => {
    const agg = goalCats.find((c: any) => c.slug === "mrr_increase");
    return agg ? goalTargets.get(agg.id) ?? 0 : 0;
  }, [goalCats, goalTargets]);
  const [salesGoals, setSalesGoals] = useState<SalesGoal[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase.from("tactical_metrics").select("id").eq("key", "vendas_dia").maybeSingle();
      if (!m) return;
      const { data } = await fetchAllPaged<any>(() => supabase.from("tactical_goals")
        .select("period_start, period_end, daily_target").eq("metric_id", (m as any).id)
        .is("team_id", null).is("user_id", null).order("period_end").order("id") as any);
      if (!cancelled) setSalesGoals(((data as any[]) || []) as SalesGoal[]);
    })();
    return () => { cancelled = true; };
  }, []);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleLine = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const fmt = (n: number) => (metric === "mrr" ? brl(n) : String(roundHalfUp(n)));

  const data = useMemo(() => {
    const series = (ym: string) => {
      const d = dailySeries(events, ym, metric, comp);
      return view === "cum" ? cumulative(d) : d;
    };
    const rows: Record<string, any>[] = [];
    if (mode === "closed") {
      const a = series(monthA), b = series(monthB);
      for (let i = 0; i < 31; i++) rows.push({ day: i + 1, [label(monthA)]: a[i] ?? null, [label(monthB)]: b[i] ?? null });
      return { rows, keys: [label(monthA), label(monthB)] };
    }
    const curDaily = dailySeries(events, curYm, metric, comp);
    const cur = view === "cum" ? cumulative(curDaily) : curDaily;
    const prev = series(prevMonth(curYm));
    const extra = series(extraMonth);
    const avg90 = businessDayAverage(events, todayIso, 90, metric, comp);
    const proj = projectMonth(curDaily, curYm, todayDay, businessDayAverage(events, todayIso, 21, metric, comp));
    const trend = view === "cum" ? trendLine(cumulative(curDaily), curYm, todayDay, proj.dailyPace) : [];
    let avgAcc = 0;
    let goalAcc = 0;
    const nDays = daysInMonth(curYm);
    let bizDays = 0;
    for (let i = 0; i < nDays; i++) {
      const iso = `${curYm}-${String(i + 1).padStart(2, "0")}`;
      if (![0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay())) bizDays++;
    }
    const showGoal = comp === "total";
    let hasGoal = false;
    for (let i = 0; i < daysInMonth(curYm); i++) {
      const iso = `${curYm}-${String(i + 1).padStart(2, "0")}`;
      const bd = ![0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
      avgAcc += bd ? avg90 : 0;
      let dayGoal: number | null = null;
      if (showGoal) {
        if (metric === "mrr") dayGoal = mrrMonthTarget > 0 && bizDays ? (bd ? mrrMonthTarget / bizDays : 0) : null;
        else { const t = dailySalesTarget(salesGoals, iso); dayGoal = t == null ? null : bd ? t : 0; }
      }
      if (dayGoal != null) { hasGoal = true; goalAcc += dayGoal; }
      rows.push({
        day: i + 1,
        [label(curYm)]: i + 1 <= todayDay ? cur[i] : null,
        Tendência: view === "cum" ? trend[i] : null,
        [label(prevMonth(curYm))]: prev[i] ?? null,
        [label(extraMonth)]: extra[i] ?? null,
        "Média 90d": view === "cum" ? avgAcc : bd ? avg90 : 0,
        Meta: dayGoal == null ? null : view === "cum" ? goalAcc : dayGoal,
      });
    }
    const keys = [label(curYm), "Tendência", label(prevMonth(curYm)), label(extraMonth), "Média 90d"];
    if (hasGoal) keys.push("Meta");
    return { rows, keys };
  }, [events, metric, comp, view, mode, monthA, monthB, curYm, extraMonth, todayDay, todayIso, mrrMonthTarget, salesGoals]);

  const cards = useMemo(() => {
    const build = (m: PacingMetric) => {
      const daily = dailySeries(events, curYm, m, comp);
      const fallback = businessDayAverage(events, todayIso, 21, m, comp);
      const atual = projectMonth(daily, curYm, todayDay, fallback);
      const pess = projectMonth(daily, curYm, todayDay, fallback, pessimisticPace(daily, curYm, todayDay));
      const acel = projectMonth(daily, curYm, todayDay, fallback, lastBusinessDaysPace(events, todayIso, 7, m, comp));
      const prevDaily = dailySeries(events, prevMonth(curYm), m, comp);
      const prevSame = cumulative(prevDaily)[Math.min(todayDay, prevDaily.length) - 1] ?? 0;
      const prevTotal = prevDaily.reduce((a, b) => a + b, 0);
      return { atual, pess, acel, prevSame, prevTotal };
    };
    return { mrr: build("mrr"), qty: build("qty") };
  }, [events, comp, curYm, todayDay, todayIso]);

  const colors = [1, 2, 3, 4, 5].map((n) => `hsl(var(--pacing-${n}))`);
  const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(1).replace(".", ",")}%` : "—");

  const ProjCard = ({ title, c, isMrr }: { title: string; c: typeof cards.mrr; isMrr: boolean }) => {
    const f = (n: number) => (isMrr ? brl(n) : String(roundHalfUp(n)));
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="text-2xl font-semibold">{f(c.atual.projected)}</div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>Realizado até hoje: <strong>{f(c.atual.realized)}</strong> · mesmo período {label(prevMonth(curYm))}: {f(c.prevSame)} ({pct(c.atual.realized, c.prevSame)})</div>
            <div>vs {label(prevMonth(curYm))} fechado ({f(c.prevTotal)}): {pct(c.atual.projected, c.prevTotal)}</div>
            <div>Ritmo: {f(c.atual.dailyPace)}/dia útil · {c.atual.remainingBusinessDays} dias úteis restantes</div>
            {!isMrr && c.atual.projected > 0 && (
              <div>Ticket implícito: {brl(cards.mrr.atual.projected / roundHalfUp(c.atual.projected) || 0)}</div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <div><div className="text-muted-foreground">Pessimista</div><div className="font-medium">{f(c.pess.projected)}</div></div>
            <div><div className="text-muted-foreground">Atual</div><div className="font-medium">{f(c.atual.projected)}</div></div>
            <div><div className="text-muted-foreground">Acelerado (7d)</div><div className="font-medium">{f(c.acel.projected)}</div></div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between text-left">
              <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" />Pacing & Comparativo de New MRR</CardTitle>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup type="single" size="sm" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as any)}>
                <ToggleGroupItem value="mtd">Mês atual</ToggleGroupItem>
                <ToggleGroupItem value="closed">Comparar meses</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" size="sm" variant="outline" value={metric} onValueChange={(v) => v && setMetric(v as any)}>
                <ToggleGroupItem value="mrr">New MRR</ToggleGroupItem>
                <ToggleGroupItem value="qty">Vendas</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(v) => v && setView(v as any)}>
                <ToggleGroupItem value="cum">Acumulado</ToggleGroupItem>
                <ToggleGroupItem value="daily">Diário</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" size="sm" variant="outline" value={origin} onValueChange={(v) => v && setOrigin(v as OriginFilter)} aria-label="Origem do gráfico">
                <ToggleGroupItem value="all">Geral</ToggleGroupItem>
                <ToggleGroupItem value="yampa">Yampa</ToggleGroupItem>
                <ToggleGroupItem value="4blue">4blue</ToggleGroupItem>
              </ToggleGroup>
              <Select value={comp} onValueChange={(v) => setComp(v as PacingComposition)}>
                <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="novos">Novos</SelectItem>
                  <SelectItem value="recuperados">Recuperados</SelectItem>
                  <SelectItem value="upsell">Upsell</SelectItem>
                </SelectContent>
              </Select>
              {mode === "mtd" ? (
                <Select value={extraMonth} onValueChange={setExtraMonth}>
                  <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{monthOptions.slice(1).map((m) => <SelectItem key={m} value={m}>Comparar: {label(m)}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <>
                  {[{ v: monthA, s: setMonthA }, { v: monthB, s: setMonthB }].map((x, i) => (
                    <Select key={i} value={x.v} onValueChange={x.s}>
                      <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{monthOptions.map((m) => <SelectItem key={m} value={m}>{label(m)}</SelectItem>)}</SelectContent>
                    </Select>
                  ))}
                </>
              )}
              {loading && <span className="text-xs text-muted-foreground">Carregando…</span>}
            </div>
            {error && <div className="text-xs text-destructive">Erro ao carregar: {error}</div>}

            {mode === "mtd" && (
              <div className="grid gap-3 md:grid-cols-2">
                <ProjCard title={`Potencial de New MRR em ${label(curYm)}`} c={cards.mrr} isMrr />
                <ProjCard title={`Potencial de Vendas em ${label(curYm)}`} c={cards.qty} isMrr={false} />
              </div>
            )}

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.rows} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (metric === "mrr" ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} labelFormatter={(d) => `Dia ${d}`} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8, cursor: "pointer" }}
                    onClick={(e: any) => e?.dataKey && toggleLine(String(e.dataKey))}
                    formatter={(value: string) => <span className={hidden.has(value) ? "text-muted-foreground line-through opacity-60" : undefined}>{value}</span>} />
                  {data.keys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} dot={false} connectNulls={false} hide={hidden.has(k)}
                      stroke={k === "Tendência" ? colors[0] : k === "Meta" ? "hsl(var(--destructive))" : colors[i % colors.length]} strokeWidth={i === 0 ? 3 : 2}
                      strokeDasharray={k === "Tendência" ? "6 4" : k === "Média 90d" ? "2 3" : k === "Meta" ? "8 3 2 3" : undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="max-h-[320px] overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr><th className="p-2 text-left">Dia</th>{data.keys.map((k) => <th key={k} className="p-2 text-right">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.day} className="border-t">
                      <td className="p-2">{r.day}</td>
                      {data.keys.map((k) => <td key={k} className="p-2 text-right">{r[k] == null ? "—" : fmt(r[k])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Tendência por dias úteis no ritmo do mês (nos 3 primeiros dias úteis, mistura com a média recente). Pessimista exclui os 25% melhores dias; Acelerado usa os últimos 7 dias úteis.
              Recuperados usam o MRR registrado e aparecem só sem filtro de origem.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
