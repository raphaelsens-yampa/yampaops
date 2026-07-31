import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import {
  DailyDatum,
  TacticalGoal,
  TacticalMetric,
  Team,
  formatMetric,
  monthPacing,
  motivationalCopy,
  realizedMonthBeforeToday,
  resolveDailyTarget,
  toBRDateKey,
} from "./types";
import type { TeamMember } from "./useTacticalData";
import { VIRTUAL_MRR_SALES, VIRTUAL_MRR_RECOVERY } from "./useTacticalData";


interface Props {
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  memberIds: string[];
  members: TeamMember[];
  teams: Team[];
  today: Date;
  revisedView?: boolean;
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

export function TacticalOverview({ metrics, goals, daily, memberIds, members, teams, today, revisedView = false }: Props) {
  const todayKey = toBRDateKey(today);
  const dateLabel = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const rows = useMemo(() => {
    const teamOf = new Map(members.map((m) => [m.user_id, m.team_id]));
    return metrics.filter((m) => m.key !== "call_realizada").map((m) => {
      let target = 0;
      let realized = 0;
      for (const uid of memberIds) {
        target += resolveDailyTarget(goals, m.id, uid, teamOf.get(uid) ?? null);
        realized += daily.find((x) => x.user_id === uid && x.metric_id === m.id && x.date === todayKey)?.value ?? 0;
      }
      const pct = target > 0 ? (realized / target) * 100 : realized > 0 ? 100 : 0;
      const monthBefore = realizedMonthBeforeToday(daily, m.id, memberIds, today);
      const pacing = monthPacing(today, target, monthBefore);
      return { m, target, realized, pct, missing: Math.max(target - realized, 0), pacing };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, goals, daily, memberIds, members, todayKey]);


  const globalKeys = ["mrr_dia", "vendas_dia", "clientes_recuperados"];
  const withGoal = rows.filter((r) => r.target > 0);
  const others: { id: string; label: string; unit: TacticalMetric["unit"]; value: number }[] = rows
    .filter((r) => (r.target <= 0 || globalKeys.includes(r.m.key)) && (r.realized > 0 || r.target > 0))
    .map((r) => ({ id: r.m.id, label: r.m.label, unit: r.m.unit, value: r.realized }));

  if (!others.some((o) => o.label.toLowerCase().includes("recuperad"))) {
    const recIds = metrics.filter((m) => m.key === "clientes_recuperados").map((m) => m.id);
    const recValue = daily
      .filter((x) => memberIds.includes(x.user_id) && x.date === todayKey && recIds.includes(x.metric_id))
      .reduce((s, x) => s + (x.value ?? 0), 0);
    others.push({ id: "recuperados-card", label: "Clientes recuperados", unit: "count", value: recValue });
  }

  // MRR separado por origem (vendas x recuperações)
  const sumVirtual = (vid: string) =>
    daily
      .filter((x) => memberIds.includes(x.user_id) && x.date === todayKey && x.metric_id === vid)
      .reduce((s, x) => s + (x.value ?? 0), 0);
  const mrrSales = sumVirtual(VIRTUAL_MRR_SALES);
  const mrrRecovery = sumVirtual(VIRTUAL_MRR_RECOVERY);
  if (mrrSales > 0 || mrrRecovery > 0) {
    const idxVendas = others.findIndex((o) => o.label.toLowerCase().includes("vendas do dia"));
    const salesCard = { id: "mrr-vendas-card", label: "MRR Vendas", unit: "currency" as const, value: mrrSales };
    if (idxVendas >= 0) others.splice(idxVendas + 1, 0, salesCard);
    else others.push(salesCard);

    const idxRec = others.findIndex((o) => o.label.toLowerCase().includes("recuperad") && o.unit !== "currency");
    const recCard = { id: "mrr-recuperados-card", label: "MRR Clientes Recuperados", unit: "currency" as const, value: mrrRecovery };
    if (idxRec >= 0) others.splice(idxRec + 1, 0, recCard);
    else others.push(recCard);
  }

  const othersGridClass =
    others.length === 1
      ? "grid-cols-1"
      : others.length === 2
        ? "grid-cols-2"
        : others.length === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : others.length === 4
            ? "grid-cols-2 md:grid-cols-4"
            : others.length % 3 === 0
              ? "grid-cols-2 sm:grid-cols-3"
              : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5";
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
        {withGoal.map(({ m, target, realized, pct, missing, pacing }) => {
          const hit = missing === 0;
          const single = withGoal.length === 1;
          const behind = revisedView && pacing.adjusted > target + 0.05;
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{m.label}</p>
                    {behind && (
                      <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px]">
                        Meta ajustada {formatMetric(Math.ceil(pacing.adjusted * 100) / 100, m.unit)}/dia
                      </Badge>
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
                    {formatMetric(realized, m.unit)} de {formatMetric(target, m.unit)} · meta diária consolidada
                  </p>
                  {behind && (
                    <p className="text-[11px] text-amber-600">
                      Para fechar o mês em {formatMetric(pacing.monthTarget, m.unit)}: ritmo de{" "}
                      {formatMetric(Math.ceil(pacing.adjusted * 100) / 100, m.unit)}/dia nos{" "}
                      {pacing.remainingBusinessDays} dias úteis restantes.
                    </p>
                  )}

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
        <div className={`grid gap-3 ${othersGridClass}`}>
          {others.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground truncate">{o.label}</p>
                <p className="text-lg font-heading font-bold">{formatMetric(o.value, o.unit)}</p>
              </CardContent>
            </Card>
          ))}

        </div>
      )}
    </div>
  );
}
