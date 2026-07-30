import { Flame, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DailyDatum,
  TacticalGoal,
  TacticalMetric,
  formatMetric,
  motivationalCopy,
  resolveDailyTarget,
  toBRDateKey,
} from "./types";

interface Props {
  userId: string;
  userName: string;
  teamId: string | null;
  teamName: string | null;
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  today: Date;
}

function computeStreak(userId: string, metricId: string, target: number, daily: DailyDatum[], today: Date): number {
  if (target <= 0) return 0;
  let streak = 0;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 60; i++) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) { d.setDate(d.getDate() - 1); continue; }
    const key = toBRDateKey(d);
    const v = daily.find((x) => x.user_id === userId && x.metric_id === metricId && x.date === key)?.value ?? 0;
    if (v >= target) streak++;
    else if (i > 0) break;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function ProgressRing({ pct, done }: { pct: number; done: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = Math.min(pct, 100) / 100;
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90 shrink-0">
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        className={done ? "stroke-success" : "stroke-primary"}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - filled)}
        style={{ transition: "stroke-dashoffset 700ms ease" }}
      />
    </svg>
  );
}

export function MissionToday({ userId, userName, teamId, teamName, metrics, goals, daily, today }: Props) {
  const todayKey = toBRDateKey(today);
  const dateLabel = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const rows = metrics.map((m) => {
    const target = resolveDailyTarget(goals, m.id, userId, teamId);
    const realized = daily.find((x) => x.user_id === userId && x.metric_id === m.id && x.date === todayKey)?.value ?? 0;
    const pct = target > 0 ? (realized / target) * 100 : realized > 0 ? 100 : 0;
    const missing = Math.max(target - realized, 0);
    const streak = computeStreak(userId, m.id, target, daily, today);
    return { m, target, realized, pct, missing, streak };
  });

  const stripeKeys = ["mrr_dia", "vendas_dia"];
  const stripeRows = rows.filter((r) => stripeKeys.includes(r.m.key));
  const withGoal = rows.filter((r) => r.target > 0);
  const others = rows.filter((r) => r.target <= 0 && !stripeKeys.includes(r.m.key));
  const done = withGoal.filter((r) => r.missing === 0).length;


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sua missão hoje</p>
          <h2 className="text-2xl font-heading font-bold">
            {userName}
            {teamName && <span className="text-muted-foreground font-normal text-base"> · Time {teamName}</span>}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground capitalize">{dateLabel}</p>
          {withGoal.length > 0 && (
            <p className="text-sm font-medium">
              {done} de {withGoal.length} metas do dia
            </p>
          )}
        </div>
      </div>

      {stripeRows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {stripeRows.map(({ m, realized, target }) => (
            <Card key={`stripe-${m.id}`} className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-2xl font-heading font-bold">{formatMetric(realized, m.unit)}</p>
                {target > 0 && (
                  <p className="text-xs text-muted-foreground">meta diária {formatMetric(target, m.unit)}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {withGoal.map(({ m, target, realized, pct, missing, streak }) => {
          const hit = missing === 0;

          return (
            <Card
              key={m.id}
              className={`relative overflow-hidden border ${hit ? "border-success/40 bg-success/5" : ""}`}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="relative">
                  <ProgressRing pct={pct} done={hit} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-heading font-bold">
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{m.label}</p>
                    {streak > 1 && (
                      <span className="flex items-center gap-0.5 text-xs text-warning font-medium">
                        <Flame className="h-3 w-3" /> {streak}
                      </span>
                    )}
                  </div>
                  {hit ? (
                    <p className="text-2xl font-heading font-bold text-success flex items-center gap-1">
                      <Check className="h-5 w-5" /> Meta batida
                    </p>
                  ) : (
                    <p className="text-3xl font-heading font-bold leading-none">
                      Faltam {formatMetric(missing, m.unit)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatMetric(realized, m.unit)} de {formatMetric(target, m.unit)} · meta diária
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    {motivationalCopy(pct, missing, m.unit)}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {withGoal.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma meta diária definida para este time ainda. Um admin pode cadastrar em “Configurar metas diárias”.
          </CardContent>
        </Card>
      )}

      {others.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {others.map(({ m, realized }) => (
            <Card key={m.id}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                <p className="text-lg font-heading font-bold">{formatMetric(realized, m.unit)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
