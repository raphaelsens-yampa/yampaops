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
}

type Granularity = "day" | "week";

export function TacticalProgressChart({ metrics, goals, daily, memberIds, teamId, today }: Props) {
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
    if (preset === "custom" && customFrom) {
      const t = customTo ?? end;
      return { from: customFrom, to: t };
    }
    const start = new Date(end);
    start.setDate(start.getDate() - (Number(preset) - 1));
    return { from: start, to: end };
  }, [preset, customFrom, customTo, today]);

  const data = useMemo(() => {
    if (!metric) return [];
    const users = memberIds.length ? memberIds : Array.from(new Set(daily.map((d) => d.user_id)));
    const dailyTargetTotal = users.reduce(
      (s, uid) => s + resolveDailyTarget(goals, metric.id, uid, teamId),
      0,
    );

    const points: { label: string; dateKey: string; meta: number; realizado: number }[] = [];
    let accMeta = 0;
    let accReal = 0;

    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    while (d <= end) {
      const dow = d.getDay();
      const key = toBRDateKey(d);
      const isBusiness = dow !== 0 && dow !== 6;
      if (isBusiness) accMeta += dailyTargetTotal;
      accReal += daily
        .filter((x) => x.metric_id === metric.id && x.date === key && users.includes(x.user_id))
        .reduce((s, x) => s + (x.value ?? 0), 0);

      points.push({
        label: format(d, "dd/MM", { locale: ptBR }),
        dateKey: key,
        meta: accMeta,
        realizado: accReal,
      });
      d.setDate(d.getDate() + 1);
    }

    if (granularity === "week") {
      const weekly: typeof points = [];
      points.forEach((p, i) => {
        const day = new Date(`${p.dateKey}T00:00:00`).getDay();
        if (i === 0 || day === 0 || i === points.length - 1) weekly.push(p);
      });
      return weekly.length ? weekly : points;
    }

    return points;
  }, [metric, memberIds, goals, teamId, daily, from, to, granularity]);

  const last = data[data.length - 1];
  const unit = metric?.unit ?? "count";

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Evolução acumulada — meta x realizado</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={metric?.id ?? ""} onValueChange={setMetricId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Métrica" /></SelectTrigger>
              <SelectContent>
                {visible.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
              </SelectContent>
            </Select>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
                  <Button variant="outline" size="sm" className={cn(!customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {customFrom
                      ? `${format(customFrom, "dd/MM/yy")} – ${customTo ? format(customTo, "dd/MM/yy") : "..."}`
                      : "Escolher período"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
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
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatMetric(Number(v), unit)} />
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
