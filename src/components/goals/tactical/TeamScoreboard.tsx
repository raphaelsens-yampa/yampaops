import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapseToggle } from "./CollapseToggle";

import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy } from "lucide-react";
import {
  DailyDatum,
  Profile,
  TacticalGoal,
  TacticalMetric,
  Team,
  formatMetric,
  resolveDailyTarget,
  toBRDateKey,
} from "./types";
import type { TeamMember } from "./useTacticalData";
import type { LowTouchSale } from "./useLowTouchData";
import { CHANNEL_LABEL } from "./recoveryChannels";
import type { SellerChannelTotals } from "./useRecoveryChannelData";

interface Props {
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  profiles: Profile[];
  memberIds: string[];
  teamId: string | null;
  teamName: string | null;
  today: Date;
  groupByTeam?: boolean;
  teams?: Team[];
  members?: TeamMember[];
  lowTouchSales?: LowTouchSale[];
  /** MRR recuperado/retido de hoje por vendedor, quebrado por canal. */
  recoveryChannels?: Map<string, SellerChannelTotals>;
}



const MEDALS = ["🥇", "🥈", "🥉"];

function defaultMetricId(metrics: TacticalMetric[], teamName: string | null, groupByTeam?: boolean) {
  const name = (teamName ?? "").toLowerCase();
  const preferredKey = groupByTeam
    ? "vendas_dia"
    : name.includes("sales") || name.includes("vendas")
      ? "vendas_dia"
      : "clientes_recuperados";
  return metrics.find((m) => m.key === preferredKey)?.id ?? metrics[0]?.id ?? "";
}

export function TeamScoreboard({ metrics, goals, daily, profiles, memberIds, teamId, teamName, today, groupByTeam, teams = [], members = [], lowTouchSales = [], recoveryChannels }: Props) {
  const [open, setOpen] = useState(true);
  const [metricId, setMetricId] = useState<string>(() => defaultMetricId(metrics, teamName, groupByTeam));

  useEffect(() => {
    setMetricId(defaultMetricId(metrics, teamName, groupByTeam));
  }, [teamId, teamName, metrics, groupByTeam]);
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

    const teamOf = new Map(members.map((m) => [m.user_id, m.team_id]));

    const userRows = memberIds.map((uid) => {
      const scopeTeam = groupByTeam ? teamOf.get(uid) ?? null : teamId;
      const target = metric ? resolveDailyTarget(goals, metric.id, uid, scopeTeam) : 0;
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
        teamId: scopeTeam,
        name: profiles.find((p) => p.user_id === uid)?.full_name || "—",
        value,
        target,
        week,
        pct: target > 0 ? Math.min((value / target) * 100, 100) : value > 0 ? 100 : 0,
      };
    });

    let rows = userRows;
    if (groupByTeam) {
      const agg = new Map<string, { uid: string; name: string; value: number; target: number; week: number; pct: number }>();
      for (const r of userRows) {
        const key = r.teamId ?? "sem-time";
        const label = teams.find((t) => t.id === r.teamId)?.name ?? "Sem time";
        const prev = agg.get(key) ?? { uid: key, name: `Time ${label}`, value: 0, target: 0, week: 0, pct: 0 };
        prev.value += r.value;
        prev.target += r.target;
        prev.week += r.week;
        agg.set(key, prev);
      }
      rows = Array.from(agg.values()).map((r) => ({
        ...r,
        teamId: null as string | null,
        pct: r.target > 0 ? Math.min((r.value / r.target) * 100, 100) : r.value > 0 ? 100 : 0,
      }));
    }
    rows = [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    // Linha Low-touch: vendas/MRR de áreas sem ação de Sales/CS
    if (groupByTeam && (metric?.key === "vendas_dia" || metric?.key === "mrr_dia")) {
      const isMrr = metric.key === "mrr_dia";
      const ltValue = lowTouchSales
        .filter((s) => s.dateKey === todayKey)
        .reduce((s, x) => s + (isMrr ? x.mrr : 1), 0);
      const ltWeek = lowTouchSales
        .filter((s) => weekKeys.includes(s.dateKey))
        .reduce((s, x) => s + (isMrr ? x.mrr : 1), 0);
      if (ltValue > 0 || ltWeek > 0) {
        rows = [...rows, { uid: "low-touch", teamId: null as string | null, name: "Low-touch", value: ltValue, target: 0, week: ltWeek, pct: ltValue > 0 ? 100 : 0 }];
      }
    }

    const teamToday = rows.reduce((s, r) => s + r.value, 0);
    const teamTarget = rows.reduce((s, r) => s + r.target, 0);
    const weekRealized = rows.reduce((s, r) => s + r.week, 0);
    const businessDaysSoFar = weekKeys.filter((k) => {
      const dt = new Date(`${k}T00:00:00`);
      return dt.getDay() !== 0 && dt.getDay() !== 6;
    }).length;
    return { rows, teamToday, teamTarget, weekRealized, weekTarget: teamTarget * businessDaysSoFar };
  }, [metric, goals, daily, profiles, memberIds, teamId, today, groupByTeam, teams, members, lowTouchSales]);



  const unit = metric?.unit ?? "count";

  return (
    <Card className="h-full">
      <CardHeader className="pb-3 space-y-3 px-4 md:px-6">
        <div className="flex items-center gap-1">
          <CollapseToggle open={open} onToggle={() => setOpen((v) => !v)} />
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning shrink-0" />
            <span className="min-w-0">Placar {groupByTeam ? "geral por time" : teamName ? `do time ${teamName}` : "da equipe"} · hoje</span>
          </CardTitle>
        </div>
        {open && (
        <Select value={metricId} onValueChange={setMetricId}>
          <SelectTrigger className="h-10 md:h-9"><SelectValue placeholder="Métrica" /></SelectTrigger>
          <SelectContent>
            {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        )}
      </CardHeader>
      {open && (
      <CardContent className="space-y-4 px-4 md:px-6">


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
              {(() => {
                const ch = recoveryChannels?.get(r.uid);
                if (!ch || (ch.cobrancaQty === 0 && ch.csQty === 0)) return null;
                return (
                  <p className="text-[10px] text-muted-foreground">
                    {CHANNEL_LABEL.cobranca} {ch.cobrancaQty} ({formatMetric(ch.cobrancaMrr, "currency")}) ·{" "}
                    {CHANNEL_LABEL.cs} {ch.csQty} ({formatMetric(ch.csMrr, "currency")})
                  </p>
                );
              })()}


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
      )}
    </Card>

  );
}
