import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Flame } from "lucide-react";
import { DailyDatum, TacticalGoal, TacticalMetric, formatMetric, toBRDateKey } from "./types";

interface Props {
  userId: string;
  userName: string;
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  today: Date;
}

function dailyTargetFor(metricId: string, userId: string, goals: TacticalGoal[]): number {
  const g = goals.find((x) => x.metric_id === metricId && x.user_id === userId)
        ?? goals.find((x) => x.metric_id === metricId && !x.user_id);
  return g?.daily_target ?? 0;
}

function computeStreak(userId: string, metricId: string, target: number, daily: DailyDatum[], today: Date): number {
  if (target <= 0) return 0;
  let streak = 0;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const key = toBRDateKey(d);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) { d.setDate(d.getDate() - 1); continue; }
    const entry = daily.find((x) => x.user_id === userId && x.metric_id === metricId && x.date === key);
    const v = entry?.value ?? 0;
    if (v >= target) streak++; else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function SellerDailyCards({ userId, userName, metrics, goals, daily, today }: Props) {
  const todayKey = toBRDateKey(today);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{userName}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {metrics.map((m) => {
          const target = dailyTargetFor(m.id, userId, goals);
          const realized = daily.find((x) => x.user_id === userId && x.metric_id === m.id && x.date === todayKey)?.value ?? 0;
          const pct = target > 0 ? Math.min(100, (realized / target) * 100) : 0;
          const streak = computeStreak(userId, m.id, target, daily, today);
          return (
            <Card key={m.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  {streak > 1 && (
                    <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                      <Flame className="h-3 w-3" /> {streak}
                    </span>
                  )}
                </div>
                <p className="text-lg font-heading font-bold">
                  {formatMetric(realized, m.unit)}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    / {target > 0 ? formatMetric(target, m.unit) : "—"}
                  </span>
                </p>
                <Progress value={pct} className="h-1.5" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
