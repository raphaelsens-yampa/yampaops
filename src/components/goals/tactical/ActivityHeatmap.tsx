import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DailyDatum, Profile, TacticalGoal, TacticalMetric, formatMetric, resolveDailyTarget, toBRDateKey } from "./types";

interface Props {
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  profiles: Profile[];
  memberIds: string[];
  teamId: string | null;
  today: Date;
}

const BUSINESS_DAYS = 30;

export function ActivityHeatmap({ metrics, goals, daily, profiles, memberIds, teamId, today }: Props) {
  const [metricId, setMetricId] = useState<string>(metrics[0]?.id ?? "");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];

  const dates = useMemo(() => {
    const out: string[] = [];
    const d = new Date(today); d.setHours(0, 0, 0, 0);
    while (out.length < BUSINESS_DAYS) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) out.unshift(toBRDateKey(d));
      d.setDate(d.getDate() - 1);
    }
    return out;
  }, [today]);

  const users = memberIds.length ? memberIds : Array.from(new Set(daily.map((d) => d.user_id)));

  function cellClass(v: number, target: number): string {
    if (!v) return "bg-muted";
    if (target > 0) {
      const r = v / target;
      if (r >= 1) return "bg-success";
      if (r >= 0.66) return "bg-primary";
      if (r >= 0.33) return "bg-primary/50";
      return "bg-primary/25";
    }
    return "bg-primary/50";
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 pb-3 px-4 md:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1">
          <CollapseToggle open={open} onToggle={() => setOpen((v) => !v)} />
          <CardTitle className="text-sm sm:text-base">Consistência — últimos {BUSINESS_DAYS} dias úteis</CardTitle>
        </div>
        {open && (
        <Select value={metricId} onValueChange={setMetricId}>
          <SelectTrigger className="h-10 md:h-9 md:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        )}
      </CardHeader>
      {open && (
      <CardContent className="space-y-3 px-4 md:px-6">

        <div className="space-y-2 overflow-x-auto no-scrollbar">
          {users.map((uid) => {
            const name = profiles.find((p) => p.user_id === uid)?.full_name || "—";
            const target = metric ? resolveDailyTarget(goals, metric.id, uid, teamId) : 0;
            return (
              <div key={uid} className="flex items-center gap-2">
                <span className="w-20 sm:w-32 text-[11px] sm:text-xs truncate shrink-0">{name}</span>
                <div className="flex gap-1">

                  {dates.map((dk) => {
                    const v = metric
                      ? daily.find((x) => x.user_id === uid && x.metric_id === metric.id && x.date === dk)?.value ?? 0
                      : 0;
                    return (
                      <div
                        key={dk}
                        title={`${dk}: ${metric ? formatMetric(v, metric.unit) : v}${target ? ` (meta ${formatMetric(target, metric!.unit)})` : ""}`}
                        className={`w-3.5 h-3.5 rounded-sm ${cellClass(v, target)}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {users.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Menos</span>
          <span className="w-3 h-3 rounded-sm bg-muted" />
          <span className="w-3 h-3 rounded-sm bg-primary/25" />
          <span className="w-3 h-3 rounded-sm bg-primary/50" />
          <span className="w-3 h-3 rounded-sm bg-primary" />
          <span className="w-3 h-3 rounded-sm bg-success" />
          <span>Meta batida</span>
        </div>
      </CardContent>
    </Card>
  );
}
