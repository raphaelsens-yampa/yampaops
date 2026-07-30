import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import {
  DailyDatum,
  TacticalGoal,
  TacticalMetric,
  Team,
  formatMetric,
  motivationalCopy,
  resolveDailyTarget,
  toBRDateKey,
} from "./types";
import type { TeamMember } from "./useTacticalData";

interface Props {
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  memberIds: string[];
  members: TeamMember[];
  teams: Team[];
  today: Date;
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

export function TacticalOverview({ metrics, goals, daily, memberIds, members, teams, today }: Props) {
  const todayKey = toBRDateKey(today);
  const dateLabel = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const rows = useMemo(() => {
    const teamOf = new Map(members.map((m) => [m.user_id, m.team_id]));
    return metrics.map((m) => {
      let target = 0;
      let realized = 0;
      for (const uid of memberIds) {
        target += resolveDailyTarget(goals, m.id, uid, teamOf.get(uid) ?? null);
        realized += daily.find((x) => x.user_id === uid && x.metric_id === m.id && x.date === todayKey)?.value ?? 0;
      }
      const pct = target > 0 ? (realized / target) * 100 : realized > 0 ? 100 : 0;
      return { m, target, realized, pct, missing: Math.max(target - realized, 0) };
    });
  }, [metrics, goals, daily, memberIds, members, todayKey]);

  const stripeKeys = ["mrr_dia", "vendas_dia"];
  const withGoal = rows.filter((r) => r.target > 0);
  const others = rows.filter((r) => r.target <= 0 || stripeKeys.includes(r.m.key));
  const done = withGoal.filter((r) => r.missing === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Visão geral</p>
          <h2 className="text-2xl font-heading font-bold">
            Todos os times
            <span className="text-muted-foreground font-normal text-base">
              {" "}
              · {teams.length} times · {memberIds.length} pessoas
            </span>
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

      <div className={`grid gap-3 ${withGoal.length === 1 ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {withGoal.map(({ m, target, realized, pct, missing }) => {
          const hit = missing === 0;
          const single = withGoal.length === 1;
          return (
            <Card key={m.id} className={`relative overflow-hidden border ${hit ? "border-success/40 bg-success/5" : ""}`}>
              <CardContent className={`p-5 flex items-center gap-4 ${single ? "justify-center" : ""}`}>
                <div className="relative">
                  <ProgressRing pct={pct} done={hit} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-heading font-bold">
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold truncate">{m.label}</p>
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
                    {formatMetric(realized, m.unit)} de {formatMetric(target, m.unit)} · meta diária consolidada
                  </p>
                  <p className="text-xs text-muted-foreground italic">{motivationalCopy(pct, missing, m.unit)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {withGoal.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma meta diária definida ainda. Um admin pode cadastrar em “Configurar metas diárias”.
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
