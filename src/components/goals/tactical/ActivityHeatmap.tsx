import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DailyDatum, TacticalMetric, formatMetric, toBRDateKey } from "./types";

interface Props {
  metrics: TacticalMetric[];
  daily: DailyDatum[];
  profiles: { user_id: string; full_name: string | null }[];
  today: Date;
}

const DAYS = 90;

export function ActivityHeatmap({ metrics, daily, profiles, today }: Props) {
  const [metricId, setMetricId] = useState<string>(metrics[0]?.id ?? "");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];

  const { dates, matrix, max, activeUsers } = useMemo(() => {
    const dates: string[] = [];
    const d = new Date(today); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (DAYS - 1));
    for (let i = 0; i < DAYS; i++) {
      dates.push(toBRDateKey(d));
      d.setDate(d.getDate() + 1);
    }
    const matrix = new Map<string, Map<string, number>>();
    let max = 0;
    if (metric) {
      for (const row of daily) {
        if (row.metric_id !== metric.id) continue;
        if (!dates.includes(row.date)) continue;
        if (!matrix.has(row.user_id)) matrix.set(row.user_id, new Map());
        matrix.get(row.user_id)!.set(row.date, (matrix.get(row.user_id)!.get(row.date) ?? 0) + row.value);
        if (row.value > max) max = row.value;
      }
    }
    const activeUsers = Array.from(matrix.keys()).sort((a, b) => {
      const na = profiles.find((p) => p.user_id === a)?.full_name || "";
      const nb = profiles.find((p) => p.user_id === b)?.full_name || "";
      return na.localeCompare(nb);
    });
    return { dates, matrix, max, activeUsers };
  }, [metric, daily, profiles, today]);

  function intensity(v: number): string {
    if (!v || max === 0) return "bg-muted";
    const r = v / max;
    if (r > 0.75) return "bg-primary";
    if (r > 0.5) return "bg-primary/70";
    if (r > 0.25) return "bg-primary/40";
    return "bg-primary/20";
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Heatmap — últimos {DAYS} dias</CardTitle>
        <Select value={metricId} onValueChange={setMetricId}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {activeUsers.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
        <div className="space-y-2 overflow-x-auto">
          {activeUsers.map((uid) => {
            const name = profiles.find((p) => p.user_id === uid)?.full_name || "—";
            const row = matrix.get(uid)!;
            return (
              <div key={uid} className="flex items-center gap-2">
                <span className="w-32 text-xs truncate">{name}</span>
                <div className="flex gap-[2px]">
                  {dates.map((dk) => {
                    const v = row.get(dk) ?? 0;
                    return (
                      <div
                        key={dk}
                        title={`${dk}: ${metric ? formatMetric(v, metric.unit) : v}`}
                        className={`w-2.5 h-2.5 rounded-sm ${intensity(v)}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
