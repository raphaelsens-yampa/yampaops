import { Flame, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DailyDatum,
  TacticalGoal,
  TacticalMetric,
  formatMetric,
  monthPacing,
  motivationalCopy,
  realizedMonthBeforeToday,
  resolveDailyTarget,
  toBRDateKey,
} from "./types";
import { VIRTUAL_MRR_SALES, VIRTUAL_MRR_RECOVERY, VIRTUAL_MRR_RETENTION } from "./useTacticalData";
import { CHANNEL_LABEL } from "./recoveryChannels";
import type { ChannelSummary } from "./useRecoveryChannelData";



interface Props {
  userId: string;
  userName: string;
  teamId: string | null;
  teamName: string | null;
  metrics: TacticalMetric[];
  allMetrics?: TacticalMetric[];

  goals: TacticalGoal[];
  daily: DailyDatum[];
  today: Date;
  revisedView?: boolean;
  /** Recorte Cobrança x CS das recuperações/retenções de hoje deste colaborador. */
  recoveryToday?: ChannelSummary;
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
    <svg viewBox="0 0 80 80" className="h-16 w-16 sm:h-20 sm:w-20 -rotate-90 shrink-0">
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


export function MissionToday({ userId, userName, teamId, teamName, metrics, allMetrics, goals, daily, today, revisedView = false, recoveryToday }: Props) {
  const todayKey = toBRDateKey(today);
  const dateLabel = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const rows = metrics
    .filter((m) => m.key !== "call_realizada")
    .map((m) => {
      const target = resolveDailyTarget(goals, m.id, userId, teamId);
      const realized = daily.find((x) => x.user_id === userId && x.metric_id === m.id && x.date === todayKey)?.value ?? 0;
      const pct = target > 0 ? (realized / target) * 100 : realized > 0 ? 100 : 0;
      const missing = Math.max(target - realized, 0);
      const streak = computeStreak(userId, m.id, target, daily, today);
      const monthBefore = realizedMonthBeforeToday(daily, m.id, [userId], today);
      const pacing = monthPacing(today, target, monthBefore);
      return { m, target, realized, pct, missing, streak, pacing };
    });


  const globalKeys = ["mrr_dia", "vendas_dia", "clientes_recuperados", "clientes_retidos", "oportunidades_abertas"];
  const withGoal = rows.filter((r) => r.target > 0);
  const others: { id: string; label: string; unit: TacticalMetric["unit"]; value: number }[] = rows
    .filter((r) => (r.target <= 0 || globalKeys.includes(r.m.key)) && (r.realized > 0 || r.target > 0))
    .map((r) => ({ id: r.m.id, label: r.m.label, unit: r.m.unit, value: r.realized }));

  const sumMetricByKey = (key: string) => {
    const ids = (allMetrics ?? metrics).filter((m) => m.key === key).map((m) => m.id);
    return daily
      .filter((x) => x.user_id === userId && x.date === todayKey && ids.includes(x.metric_id))
      .reduce((s, x) => s + (x.value ?? 0), 0);
  };

  if (!others.some((o) => o.label.toLowerCase().includes("recuperad"))) {
    others.push({
      id: "recuperados-card",
      label: "Clientes recuperados",
      unit: "count",
      value: sumMetricByKey("clientes_recuperados"),
    });
  }

  // MRR separado por origem (vendas x recuperações x retenções)
  const sumVirtual = (vid: string) =>
    daily
      .filter((x) => x.user_id === userId && x.date === todayKey && x.metric_id === vid)
      .reduce((s, x) => s + (x.value ?? 0), 0);
  const mrrSales = sumVirtual(VIRTUAL_MRR_SALES);
  const mrrRecovery = sumVirtual(VIRTUAL_MRR_RECOVERY);
  const mrrRetention = sumVirtual(VIRTUAL_MRR_RETENTION);
  const retainedQty = sumMetricByKey("clientes_retidos");

  if (mrrSales > 0 || mrrRecovery > 0 || mrrRetention > 0) {
    const idxVendas = others.findIndex((o) => o.label.toLowerCase().includes("vendas do dia"));
    const salesCard = { id: "mrr-vendas-card", label: "MRR Vendas", unit: "currency" as const, value: mrrSales };
    if (idxVendas >= 0) others.splice(idxVendas + 1, 0, salesCard);
    else others.push(salesCard);

    const idxRec = others.findIndex((o) => o.label.toLowerCase().includes("recuperad") && o.unit !== "currency");
    const recCard = { id: "mrr-recuperados-card", label: "MRR Clientes Recuperados", unit: "currency" as const, value: mrrRecovery };
    if (idxRec >= 0) others.splice(idxRec + 1, 0, recCard);
    else others.push(recCard);
  }

  if (retainedQty > 0 || mrrRetention > 0) {
    if (!others.some((o) => o.label.toLowerCase().includes("retid"))) {
      others.push({ id: "retidos-card", label: "Clientes retidos", unit: "count", value: retainedQty });
    }
    const idxRet = others.findIndex((o) => o.label.toLowerCase().includes("retid") && o.unit !== "currency");
    const retCard = { id: "mrr-retidos-card", label: "MRR Clientes Retidos", unit: "currency" as const, value: mrrRetention };
    if (idxRet >= 0) others.splice(idxRet + 1, 0, retCard);
    else others.push(retCard);
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
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground">Sua missão hoje</p>
          <h2 className="text-lg sm:text-2xl font-heading font-bold leading-tight">
            {userName}
            {teamName && <span className="text-muted-foreground font-normal text-sm sm:text-base"> · Time {teamName}</span>}
          </h2>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] sm:text-xs text-muted-foreground capitalize">{dateLabel}</p>
          {withGoal.length > 0 && (
            <p className="text-xs sm:text-sm font-medium">
              {done} de {withGoal.length} metas do dia
            </p>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${withGoal.length === 1 ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {withGoal.map(({ m, target, realized, pct, missing, streak, pacing }) => {
          const hit = missing === 0;
          const single = withGoal.length === 1;
          const behind = revisedView && pacing.adjusted > target + 0.05;

          return (
            <Card
              key={m.id}
              className={`relative overflow-hidden border ${hit ? "border-success/40 bg-success/5" : ""}`}
            >
              <CardContent className={`p-4 sm:p-5 flex items-center gap-3 sm:gap-4 ${single ? "sm:justify-center" : ""}`}>
                <div className="relative">
                  <ProgressRing pct={pct} done={hit} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-heading font-bold">
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{m.label}</p>
                    {streak > 1 && (
                      <span className="flex items-center gap-0.5 text-xs text-warning font-medium">
                        <Flame className="h-3 w-3" /> {streak}
                      </span>
                    )}
                    {behind && (
                      <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px]">
                        Meta ajustada {formatMetric(Math.ceil(pacing.adjusted * 100) / 100, m.unit)}/dia
                      </Badge>
                    )}
                  </div>
                  {hit ? (
                    <p className="text-xl sm:text-2xl font-heading font-bold text-success flex items-center gap-1">
                      <Check className="h-5 w-5" /> Meta batida
                    </p>
                  ) : (
                    <p className="text-2xl sm:text-3xl font-heading font-bold leading-none">
                      Faltam {formatMetric(missing, m.unit)}
                    </p>
                  )}
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    {formatMetric(realized, m.unit)} de {formatMetric(target, m.unit)} · meta diária
                  </p>
                  {behind && (
                    <p className="text-[11px] text-amber-600">
                      Para fechar o mês em {formatMetric(pacing.monthTarget, m.unit)}: ritmo de{" "}
                      {formatMetric(Math.ceil(pacing.adjusted * 100) / 100, m.unit)}/dia nos{" "}
                      {pacing.remainingBusinessDays} dias úteis restantes.
                    </p>
                  )}

                  <p className="text-[11px] sm:text-xs text-muted-foreground italic">
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
        <div className={`grid gap-2 sm:gap-3 ${othersGridClass}`}>
          {others.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-3">
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight line-clamp-2">{o.label}</p>
                <p className="text-base sm:text-lg font-heading font-bold mt-0.5">{formatMetric(o.value, o.unit)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

