import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy } from "lucide-react";
import {
  DailyDatum,
  Profile,
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
  profiles: Profile[];
  memberIds: string[];
  teamId: string | null;
  teamName: string | null;
  today: Date;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function TeamScoreboard({ metrics, goals, daily, profiles, memberIds, teamId, teamName, today }: Props) {
  const [metricId, setMetricId] = useState<string>(metrics[0]?.id ?? "");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];

  const { rows, teamToday, teamTarget, weekRealized, weekTarget } = useMemo(() => {
    const todayKey = toBRDateKey(today);
    const weekKeys: string[] = [];
    const d = new Date(today);
    const dow = (d.getDay() + 6) % 7; // segunda = 0
    d.setDate(d.getDate() - dow);
    for (let i = 0; i <= dow; i++) {
      weekKeys.push(toBRDateKey(d));
      d.setDate(d.getDate() + 1);
    }

    const rows = memberIds.map((uid) => {
      const target = metric ? resolveDailyTarget(goals, metric.id, uid, teamId) : 0;
      const value = metric
        ? daily.find((x) => x.user_id === uid && x.metric_id === metric.id && x.date === todayKey)?.value ?? 0
        : 0;
      const week = metric
        ? daily
            .filter((x) => x.user_id === uid && x.metric_id === metric.id && weekKeys.includes(x.date))
            .reduce((s, x) => s + x.value, 0)
        : 0;
      return {
        uid,
        name: profiles.find((p) => p.user_id === uid)?.full_name || "—",
        value,
        target,
        week,
        pct: target > 0 ? Math.min((value / target) * 100, 100) : value > 0 ? 100 : 0,
      };
    });
    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    const teamToday = rows.reduce((s, r) => s + r.value, 0);
    const teamTarget = rows.reduce((s, r) => s + r.target, 0);
    const weekRealized = rows.reduce((s, r) => s + r.week, 0);
    const businessDaysSoFar = weekKeys.filter((k) => {
      const dt = new Date(`${k}T00:00:00`);
      return dt.getDay() !== 0 && dt.getDay() !== 6;
    }).length;
    return { rows, teamToday, teamTarget, weekRealized, weekTarget: teamTarget * businessDaysSoFar };
  }, [metric, goals, daily, profiles, memberIds, teamId, today]);

  const unit = metric?.unit ?? "count";

  return (
    <Card className="h-full">
      <CardHeader className="pb-3 space-y-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          Placar {teamName ? `do time ${teamName}` : "da equipe"} · hoje
        </CardTitle>
        <Select value={metricId} onValueChange={setMetricId}>
          <SelectTrigger><SelectValue placeholder="Métrica" /></SelectTrigger>
          <SelectContent>
            {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.uid} className="space-y-1">
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-center">{MEDALS[i] ?? i + 1}</span>
                  <span className="truncate font-medium">{r.name}</span>
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {formatMetric(r.value, unit)}
                  {r.target > 0 && ` / ${formatMetric(r.target, unit)}`}
                </span>
              </div>
              <Progress value={r.pct} className="h-1.5" />
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem membros neste time.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Time hoje</p>
            <p className="text-lg font-heading font-bold">
              {formatMetric(teamToday, unit)}
              {teamTarget > 0 && (
                <span className="text-xs text-muted-foreground font-normal"> / {formatMetric(teamTarget, unit)}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Semana</p>
            <p className="text-lg font-heading font-bold">
              {formatMetric(weekRealized, unit)}
              {weekTarget > 0 && (
                <span className="text-xs text-muted-foreground font-normal"> / {formatMetric(weekTarget, unit)}</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
