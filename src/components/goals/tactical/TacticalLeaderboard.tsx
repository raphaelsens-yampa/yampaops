import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy } from "lucide-react";
import { DailyDatum, TacticalMetric, formatMetric, toBRDateKey } from "./types";

interface Props {
  metrics: TacticalMetric[];
  daily: DailyDatum[];
  profiles: { user_id: string; full_name: string | null }[];
  today: Date;
}

type Window = "day" | "week" | "month";

export function TacticalLeaderboard({ metrics, daily, profiles, today }: Props) {
  const [metricId, setMetricId] = useState<string>(metrics[0]?.id ?? "");
  const [win, setWin] = useState<Window>("day");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];

  const rows = useMemo(() => {
    if (!metric) return [];
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    if (win === "week") start.setDate(start.getDate() - 6);
    else if (win === "month") start.setDate(start.getDate() - 29);
    const startKey = toBRDateKey(start);
    const endKey = toBRDateKey(today);
    const byUser = new Map<string, number>();
    for (const d of daily) {
      if (d.metric_id !== metric.id) continue;
      if (d.date < startKey || d.date > endKey) continue;
      byUser.set(d.user_id, (byUser.get(d.user_id) ?? 0) + d.value);
    }
    const arr = Array.from(byUser.entries()).map(([user_id, value]) => ({
      user_id,
      name: profiles.find((p) => p.user_id === user_id)?.full_name || "—",
      value,
    }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [metric, daily, profiles, today, win]);

  const max = rows[0]?.value || 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Leaderboard
        </CardTitle>
        <div className="flex items-center gap-2">
          <Tabs value={win} onValueChange={(v) => setWin(v as Window)}>
            <TabsList>
              <TabsTrigger value="day">Dia</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">30d</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={metricId} onValueChange={setMetricId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro no período.</p>}
        {rows.map((r, i) => (
          <div key={r.user_id} className="flex items-center gap-3">
            <span className="w-6 text-sm font-semibold text-muted-foreground">{i + 1}º</span>
            <span className="w-40 text-sm truncate">{r.name}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            <span className="w-28 text-right text-sm font-medium">{metric && formatMetric(r.value, metric.unit)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
