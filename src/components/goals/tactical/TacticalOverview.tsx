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
import {
  buildPeriodValues,
  createPeriodTargetResolver,
  formatTacticalPeriod,
  isSingleDayPeriod,
  tacticalPeriodKeys,
  tacticalRealizedWithLowTouch,

  tacticalTargetPeriodKeys,
  type TacticalPeriod,
} from "./tacticalPeriod";
import type { TeamMember } from "./useTacticalData";
import { VIRTUAL_MRR_SALES, VIRTUAL_MRR_RECOVERY, VIRTUAL_MRR_RETENTION, VIRTUAL_MRR_UPSELL } from "./useTacticalData";
import type { LowTouchSale } from "./useLowTouchData";
import { CHANNEL_LABEL } from "./recoveryChannels";
import type { ChannelSummary } from "./useRecoveryChannelData";
import { useRecoveryReconciliation } from "./useRecoveryReconciliation";
import type { OriginFilter } from "@/lib/origins";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Info } from "lucide-react";


interface Props {
  metrics: TacticalMetric[];
  goals: TacticalGoal[];
  daily: DailyDatum[];
  memberIds: string[];
  members: TeamMember[];
  teams: Team[];
  today: Date;
  /** Janela "de ... até ..." acumulada nos cards. Sem ela, vale só o dia de referência. */
  period?: TacticalPeriod;
  revisedView?: boolean;
  lowTouchSales?: LowTouchSale[];
  /** Upsells Low-touch (áreas sem ação de Sales/CS), contabilizados como Upsell. */
  lowTouchUpsells?: LowTouchSale[];
  /** Recorte Cobrança x CS das recuperações/retenções no mês corrente. */
  recoveryChannels?: ChannelSummary;
  origin?: OriginFilter;
  refreshKey?: number;
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


export function TacticalOverview({ metrics, goals, daily, memberIds, members, teams, today, period, revisedView = false, lowTouchSales = [], lowTouchUpsells = [], recoveryChannels, origin = "all", refreshKey = 0 }: Props) {
  const todayKey = toBRDateKey(today);
  const dateLabel = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const activePeriod = useMemo<TacticalPeriod>(() => period ?? { from: today, to: today }, [period, today]);
  const singleDay = isSingleDayPeriod(activePeriod);
  const periodKeys = useMemo(() => new Set(tacticalPeriodKeys(activePeriod)), [activePeriod]);
  const targetKeys = useMemo(() => tacticalTargetPeriodKeys(activePeriod), [activePeriod]);
  const values = useMemo(() => buildPeriodValues(daily, periodKeys), [daily, periodKeys]);
  const recon = useRecoveryReconciliation(
    toBRDateKey(activePeriod.from), toBRDateKey(activePeriod.to), memberIds, origin, refreshKey,
  );
  const resolveTarget = useMemo(() => createPeriodTargetResolver(goals), [goals]);
  /** "Vendas do dia" deixa de ser "do dia" quando o recorte é um período. */
  const labelOf = (l: string) => (singleDay ? l : l.replace(/\bdo dia\b/i, "no período"));

  const ltUpPeriodCount = lowTouchUpsells.filter((s) => periodKeys.has(s.dateKey)).length;
  /** Vendas Low-touch do período: entram na meta de Vendas, não só no card avulso. */
  const ltPeriodCount = lowTouchSales.filter((s) => periodKeys.has(s.dateKey)).length;
  const rows = useMemo(() => {
    const teamOf = new Map(members.map((m) => [m.user_id, m.team_id]));
    return metrics.filter((m) => m.key !== "call_realizada").map((m) => {
      let target = 0;
      let dailyTarget = 0;
      let realized = 0;
      for (const uid of memberIds) {
        const scopeTeam = teamOf.get(uid) ?? null;
        target += resolveTarget(m.id, uid, scopeTeam, targetKeys);
        dailyTarget += resolveDailyTarget(goals, m.id, uid, scopeTeam, today);
        realized += values.get(`${uid}|${m.id}`) ?? 0;
      }
      // Low-touch conta nas metas: vendas em "Vendas do dia", upsells em "Clientes Upsell".
      realized = tacticalRealizedWithLowTouch(m.key, realized, { sales: ltPeriodCount, upsells: ltUpPeriodCount });


      const pct = target > 0 ? (realized / target) * 100 : realized > 0 ? 100 : 0;
      const monthBefore = realizedMonthBeforeToday(daily, m.id, memberIds, today);
      const pacing = monthPacing(today, dailyTarget, monthBefore);
      return { m, target, dailyTarget, realized, pct, missing: Math.max(target - realized, 0), pacing };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, goals, daily, memberIds, members, activePeriod, values, resolveTarget, targetKeys, ltUpPeriodCount, ltPeriodCount]);

  const globalKeys = ["mrr_dia", "vendas_dia", "clientes_recuperados", "clientes_retidos", "oportunidades_abertas"];
  const withGoal = rows.filter((r) => r.target > 0);

  // Vendas/MRR Low-touch do período (áreas sem ação de Sales/CS)
  const ltPeriod = lowTouchSales.filter((s) => periodKeys.has(s.dateKey));
  const ltCount = ltPeriod.length;
  const ltMrr = ltPeriod.reduce((s, x) => s + (x.mrr ?? 0), 0);
  // Upsells Low-touch do período: o histórico vem do Metabase (D-1), então o dia
  // vigente é coberto pelo Stripe aqui, sem duplicar com o realizado canônico.
  const ltUpPeriod = lowTouchUpsells.filter((s) => periodKeys.has(s.dateKey));
  const ltUpCount = ltUpPeriod.length;
  const ltUpMrr = ltUpPeriod.reduce((s, x) => s + (x.mrr ?? 0), 0);

  /** Recuperados FT do período: contam como venda nova (CNPJs que não converteram no FT). */
  const ftPeriodCount = useMemo(() => {
    const ids = metrics.filter((m) => m.key === "recuperados_ft").map((m) => m.id);
    let total = 0;
    for (const uid of memberIds) for (const id of ids) total += values.get(`${uid}|${id}`) ?? 0;
    return Math.round(total);
  }, [metrics, memberIds, values]);

  type OtherCard = { id: string; label: string; unit: TacticalMetric["unit"]; value: number; note?: string };
  const others: OtherCard[] = rows
    .filter((r) => (r.target <= 0 || globalKeys.includes(r.m.key)) && (r.realized > 0 || r.target > 0))
    .map((r) => {
      // Vendas já somam low-touch e recuperados FT em `realized`; só o MRR do dia
      // recebe o acréscimo aqui.
      const extra = r.m.key === "mrr_dia" ? ltMrr : 0;
      const notes: string[] = [];
      if (r.m.key === "vendas_dia") {
        if (ltCount > 0) notes.push(`inclui low-touch: ${formatMetric(ltCount, r.m.unit)}`);
        if (ftPeriodCount > 0) notes.push(`recuperados FT: ${formatMetric(ftPeriodCount, r.m.unit)}`);
      } else if (extra > 0) {
        notes.push(`inclui low-touch: ${formatMetric(extra, r.m.unit)}`);
      }
      return {
        id: r.m.id,
        label: labelOf(r.m.label),
        unit: r.m.unit,
        value: r.realized + extra,
        note: notes.length ? notes.join(" · ") : undefined,
      };
    });



  const sumMetricByKey = (key: string) => {
    const ids = metrics.filter((m) => m.key === key).map((m) => m.id);
    let total = 0;
    for (const uid of memberIds) for (const id of ids) total += values.get(`${uid}|${id}`) ?? 0;
    return total;
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
  const sumVirtual = (vid: string) => {
    let total = 0;
    for (const uid of memberIds) total += values.get(`${uid}|${vid}`) ?? 0;
    return total;
  };
  const mrrSales = sumVirtual(VIRTUAL_MRR_SALES);
  const mrrRecovery = sumVirtual(VIRTUAL_MRR_RECOVERY);
  // Recuperação que já estava na base oficial só preserva MRR: sai do total do período.
  const preservedMrr = recon?.preserved.mrr ?? 0;
  if (preservedMrr > 0) {
    const mrrCard = others.find((o) => rows.some((r) => r.m.id === o.id && r.m.key === "mrr_dia"));
    if (mrrCard) {
      mrrCard.value = Math.max(mrrCard.value - preservedMrr, 0);
      mrrCard.note = [mrrCard.note, `sem ${formatMetric(preservedMrr, "currency")} já na base`].filter(Boolean).join(" · ");
    }
  }
  const mrrRetention = sumVirtual(VIRTUAL_MRR_RETENTION);
  const mrrUpsell = sumVirtual(VIRTUAL_MRR_UPSELL);
  const retainedQty = sumMetricByKey("clientes_retidos");
  const upsellQty = sumMetricByKey("upsell_dia");

  if (mrrSales > 0 || mrrRecovery > 0 || ltMrr > 0 || mrrRetention > 0) {
    const idxVendas = others.findIndex((o) => o.label.toLowerCase().includes("vendas"));
    const salesCard: OtherCard = { id: "mrr-vendas-card", label: "MRR Vendas", unit: "currency", value: mrrSales };
    if (idxVendas >= 0) others.splice(idxVendas + 1, 0, salesCard);
    else others.push(salesCard);

    const idxRec = others.findIndex((o) => o.label.toLowerCase().includes("recuperad") && o.unit !== "currency");
    const recCard: OtherCard = {
      id: "mrr-recuperados-card",
      label: "MRR Clientes Recuperados",
      unit: "currency",
      value: recon ? Math.max(mrrRecovery - preservedMrr, 0) : mrrRecovery,
      note: recon && preservedMrr > 0 ? `declarado: ${formatMetric(mrrRecovery, "currency")}` : undefined,
    };
    if (idxRec >= 0) others.splice(idxRec + 1, 0, recCard);
    else others.push(recCard);
  }

  if (retainedQty > 0 || mrrRetention > 0) {
    if (!others.some((o) => o.label.toLowerCase().includes("retid"))) {
      others.push({ id: "retidos-card", label: "Clientes retidos", unit: "count", value: retainedQty });
    }
    const idxRet = others.findIndex((o) => o.label.toLowerCase().includes("retid") && o.unit !== "currency");
    const retCard: OtherCard = { id: "mrr-retidos-card", label: "MRR Clientes Retidos", unit: "currency", value: mrrRetention };
    if (idxRet >= 0) others.splice(idxRet + 1, 0, retCard);
    else others.push(retCard);
  }

  others.push({ id: "upsell-clientes-card", label: "Clientes Upsell", unit: "count", value: upsellQty + ltUpCount });
  others.push({ id: "mrr-upsell-card", label: "MRR Upsell", unit: "currency", value: mrrUpsell + ltUpMrr });

  if (ltCount > 0 || ltMrr > 0) {
    others.push({ id: "lowtouch-vendas-card", label: "Vendas Low-touch", unit: "count", value: ltCount });
    others.push({ id: "lowtouch-mrr-card", label: "MRR Low-touch", unit: "currency", value: ltMrr });
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
          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground">Visão geral</p>
          <h2 className="text-lg sm:text-2xl font-heading font-bold leading-tight">
            Todos os times
            <span className="text-muted-foreground font-normal text-sm sm:text-base">
              {" "}
              · {teams.length} times · {memberIds.length} pessoas
            </span>
          </h2>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] sm:text-xs text-muted-foreground capitalize">
            {singleDay ? dateLabel : formatTacticalPeriod(activePeriod)}
          </p>
          {withGoal.length > 0 && (
            <p className="text-xs sm:text-sm font-medium">
              {done} de {withGoal.length} metas do {singleDay ? "dia" : "período"}
            </p>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${withGoal.length === 1 ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {withGoal.map(({ m, target, dailyTarget, realized, pct, missing, pacing }) => {
          const hit = missing === 0;
          const single = withGoal.length === 1;
          const behind = revisedView && pacing.adjusted > dailyTarget + 0.05;
          return (
            <Card key={m.id} className={`relative overflow-hidden border ${hit ? "border-success/40 bg-success/5" : ""}`}>
              <CardContent className={`p-4 sm:p-5 flex items-center gap-3 sm:gap-4 ${single ? "sm:justify-center" : ""}`}>
                <div className="relative">
                  <ProgressRing pct={pct} done={hit} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-heading font-bold">
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{labelOf(m.label)}</p>
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
                    {formatMetric(realized, m.unit)} de {formatMetric(target, m.unit)} · meta{" "}
                    {singleDay ? "diária consolidada" : "acumulada do período"}
                  </p>
                  {behind && (
                    <p className="text-[11px] text-amber-600">
                      Para fechar o mês em {formatMetric(pacing.monthTarget, m.unit)}: ritmo de{" "}
                      {formatMetric(Math.ceil(pacing.adjusted * 100) / 100, m.unit)}/dia nos{" "}
                      {pacing.remainingBusinessDays} dias úteis restantes.
                    </p>
                  )}

                  <p className="text-[11px] sm:text-xs text-muted-foreground italic">{motivationalCopy(pct, missing, m.unit)}</p>
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
        <div className={`grid gap-2 sm:gap-3 ${othersGridClass}`}>
          {others.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-3">
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight line-clamp-2">{o.label}</p>
                <p className="text-base sm:text-lg font-heading font-bold mt-0.5">{formatMetric(o.value, o.unit)}</p>
                {o.note && <p className="text-[10px] text-muted-foreground line-clamp-2">{o.note}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {recon && recon.declared.qty > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <button className="w-full text-left rounded-md border border-dashed bg-muted/40 p-3 text-xs flex gap-2 items-start hover:bg-muted">
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <span>
                <strong>Recuperações conferidas com a base oficial.</strong> Declarado pelo CS:{" "}
                {formatMetric(recon.declared.mrr, "currency")} ({recon.declared.qty}) · Entra no MRR oficial:{" "}
                <strong>{formatMetric(recon.official.mrr, "currency")} ({recon.official.qty})</strong> · Já estava na base:{" "}
                {formatMetric(recon.preserved.mrr, "currency")} ({recon.preserved.qty}). O MRR do período soma só o que entra no
                MRR oficial. <span className="underline">Ver cliente a cliente</span>
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Recuperações × base oficial</DialogTitle>
            </DialogHeader>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1">Cliente</th><th>Data</th><th>Base de</th><th className="text-right">MRR</th><th className="pl-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {[...recon.rows].sort((a, b) => b.recoveredAt.localeCompare(a.recoveredAt)).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1 break-all">{r.name || r.email}</td>
                    <td>{r.recoveredAt.split("-").reverse().join("/")}</td>
                    <td>{r.baseDate ? r.baseDate.split("-").reverse().join("/") : "—"}</td>
                    <td className="text-right">{formatMetric(r.mrr, "currency")}</td>
                    <td className="pl-2">
                      <Badge variant={r.status === "official" ? "default" : "secondary"}>
                        {r.status === "official" ? "Soma no MRR" : "Já na base"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogContent>
        </Dialog>
      )}

      {recoveryChannels && recoveryChannels.total.qty > 0 && (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-2">
            <p className="text-[11px] sm:text-xs uppercase tracking-wider text-muted-foreground">
              Recuperados e retidos no mês · por canal
            </p>
            <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3">
              {([
                ["cobranca", recoveryChannels.cobranca],
                ["cs", recoveryChannels.cs],
              ] as const).map(([ch, v]) => (
                <div key={ch} className="rounded-md border p-2">
                  <p className="text-[11px] text-muted-foreground">{CHANNEL_LABEL[ch]}</p>
                  <p className="text-base sm:text-lg font-heading font-bold">
                    {v.qty} {v.qty === 1 ? "cliente" : "clientes"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatMetric(v.mrr, "currency")} ·{" "}
                    {recoveryChannels.total.mrr > 0
                      ? Math.round((v.mrr / recoveryChannels.total.mrr) * 100)
                      : 0}
                    % do MRR
                  </p>
                </div>
              ))}
              <div className="rounded-md border p-2">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-base sm:text-lg font-heading font-bold">{recoveryChannels.total.qty}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatMetric(recoveryChannels.total.mrr, "currency")}
                  {recoveryChannels.missingReason > 0 && (
                    <span className="text-amber-600"> · {recoveryChannels.missingReason} sem motivo</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
