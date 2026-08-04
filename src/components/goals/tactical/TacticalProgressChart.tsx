import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DailyDatum,
  TacticalGoal,
  TacticalMetric,
  formatMetric,
  monthPacing,
  realizedMonthBeforeToday,
  resolveDailyTarget,
  toBRDateKey,
} from "./types";


interface Props {
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  memberIds: string[];
  teamId: string | null;
  today: Date;
  revisedView?: boolean;
}

type Granularity = "day" | "week" | "monthWeeks";

export function TacticalProgressChart({ metrics, goals, daily, memberIds, teamId, today, revisedView = false }: Props) {
  const visible = useMemo(() => metrics.filter((m) => m.key !== "call_realizada"), [metrics]);
  const defaultMetricId = useMemo(
    () => visible.find((m) => m.key === "vendas_dia")?.id ?? visible[0]?.id ?? "",
    [visible],
  );
  const [metricId, setMetricId] = useState<string>(defaultMetricId);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [preset, setPreset] = useState<string>("30");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const metric =
    visible.find((m) => m.id === metricId) ??
    visible.find((m) => m.key === "vendas_dia") ??
    visible[0];

  const { from, to } = useMemo(() => {
    const end = new Date(today);
    end.setHours(0, 0, 0, 0);
    if (granularity === "monthWeeks") {
      return {
        from: new Date(end.getFullYear(), end.getMonth(), 1),
        to: new Date(end.getFullYear(), end.getMonth() + 1, 0),
      };
    }
    if (preset === "custom" && customFrom) {
      const t = customTo ?? end;
      return { from: customFrom, to: t };
    }
    const start = new Date(end);
    start.setDate(start.getDate() - (Number(preset) - 1));
    return { from: start, to: end };
  }, [preset, customFrom, customTo, today, granularity]);


  const data = useMemo(() => {
    if (!metric) return [];
    const users = memberIds.length ? memberIds : Array.from(new Set(daily.map((d) => d.user_id)));
    const dailyTargetTotal = users.reduce(
      (s, uid) => s + resolveDailyTarget(goals, metric.id, uid, teamId),
      0,
    );

    // Meta revisada: ritmo necessário no restante do mês para fechar a meta mensal
    const monthBefore = realizedMonthBeforeToday(daily, metric.id, users, today);
    const pacing = monthPacing(today, dailyTargetTotal, monthBefore);
    const todayKey = toBRDateKey(today);

    const points: { label: string; dateKey: string; meta: number; metaRevisada: number; realizado: number }[] = [];
    let accMeta = 0;
    let accRevised = 0;
    let accReal = 0;

    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    while (d <= end) {
      const dow = d.getDay();
      const key = toBRDateKey(d);
      const isBusiness = dow !== 0 && dow !== 6;
      if (isBusiness) {
        accMeta += dailyTargetTotal;
        accRevised += key >= todayKey ? pacing.adjusted : dailyTargetTotal;
      }
      accReal += daily
        .filter((x) => x.metric_id === metric.id && x.date === key && users.includes(x.user_id))
        .reduce((s, x) => s + (x.value ?? 0), 0);

      points.push({
        label: format(d, "dd/MM", { locale: ptBR }),
        dateKey: key,
        meta: accMeta,
        metaRevisada: accRevised,
        realizado: accReal,
      });
      d.setDate(d.getDate() + 1);
    }

    if (granularity === "monthWeeks") {
      const byKey = new Map(points.map((p) => [p.dateKey, p]));
      return weeksOfMonth(today).map((w) => {
        const endKey = toBRDateKey(w.end);
        const cutKey = endKey <= todayKey ? endKey : todayKey;
        const p = byKey.get(endKey);
        const cut = byKey.get(cutKey);
        return {
          label: `${w.label} (${w.rangeLabel})`,
          dateKey: endKey,
          meta: p?.meta ?? 0,
          metaRevisada: p?.metaRevisada ?? 0,
          realizado: toBRDateKey(w.start) > todayKey ? (null as any) : cut?.realizado ?? 0,
        };
      });
    }

    if (granularity === "week") {
      const weekly: typeof points = [];
      points.forEach((p, i) => {
        const day = new Date(`${p.dateKey}T00:00:00`).getDay();
        if (i === 0 || day === 0 || i === points.length - 1) {
          if (!weekly.some((w) => w.dateKey === p.dateKey)) weekly.push(p);
        }
      });
      return weekly.length ? weekly : points;
    }


    return points;
  }, [metric, memberIds, goals, teamId, daily, from, to, granularity, today]);

  const showRevised = useMemo(
    () => revisedView && data.some((p) => Math.abs(p.metaRevisada - p.meta) > 0.5),
    [data, revisedView],
  );


  const last = data[data.length - 1];
  const unit = metric?.unit ?? "count";

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3 px-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <CardTitle className="text-sm sm:text-base">Evolução acumulada — meta x realizado</CardTitle>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
            <Select value={metric?.id ?? ""} onValueChange={setMetricId}>
              <SelectTrigger className="col-span-2 h-10 md:h-9 md:w-52"><SelectValue placeholder="Métrica" /></SelectTrigger>
              <SelectContent>
                {visible.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
              <SelectTrigger className="h-10 md:h-9 md:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
              </SelectContent>
            </Select>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-10 md:h-9 md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("col-span-2 h-10 md:h-9", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {customFrom
                      ? `${format(customFrom, "dd/MM/yy")} – ${customTo ? format(customTo, "dd/MM/yy") : "..."}`
                      : "Escolher período"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={(r: any) => { setCustomFrom(r?.from); setCustomTo(r?.to); }}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
        {last && (
          <p className="text-xs text-muted-foreground">
            Acumulado no período — meta {formatMetric(last.meta, unit)} · realizado{" "}
            <span className="font-medium text-foreground">{formatMetric(last.realizado, unit)}</span>
            {showRevised && (
              <>
                {" · "}
                <span className="text-amber-600">
                  meta revisada {formatMetric(last.metaRevisada, unit)}
                </span>
              </>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="px-2 sm:px-4 md:px-6">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v) => formatMetric(Number(v), unit)} />

              <Tooltip
                formatter={(v: any, name: any) => [formatMetric(Number(v), unit), name]}
                labelClassName="text-xs"
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="meta"
                name="Meta acumulada"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
              />
              {showRevised && (
                <Line
                  type="monotone"
                  dataKey="metaRevisada"
                  name="Meta revisada"
                  stroke="hsl(38 92% 50%)"
                  strokeWidth={2}
                  dot={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="realizado"
                name="Realizado acumulado"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={false}
              />

            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
