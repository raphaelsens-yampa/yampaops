import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Target, Percent, Gauge, ShoppingBag, Activity } from "lucide-react";

interface NetMrrBreakdown {
  novo: number;
  expansao: number;
  downgrade: number;
  churn: number;
  total: number;
}

interface Props {
  realized: number;
  target: number;
  pace: number;
  daysElapsed: number;
  totalDays: number;
  dealsRealized?: number;
  dealsTarget?: number;
  netMrr?: NetMrrBreakdown;
  netMrrTarget?: number;
}

const fmt = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

export function GoalKpiCards({
  realized, target, pace, daysElapsed, totalDays,
  dealsRealized = 0, dealsTarget = 0,
  netMrr, netMrrTarget = 0,
}: Props) {
  const pct = target > 0 ? (realized / target) * 100 : 0;
  const pacePct = target > 0 ? (pace / target) * 100 : 0;
  const dealsPct = dealsTarget > 0 ? (dealsRealized / dealsTarget) * 100 : 0;

  const statusColor = pct >= 100 ? "text-emerald-500" : pct >= 70 ? "text-amber-500" : "text-rose-500";
  const paceColor = pacePct >= 100 ? "text-emerald-500" : pacePct >= 70 ? "text-amber-500" : "text-rose-500";
  const dealsColor = dealsPct >= 100 ? "text-emerald-500" : dealsPct >= 70 ? "text-amber-500" : "text-rose-500";

  const cards = [
    { icon: TrendingUp, label: "MRR Realizado", value: fmt(realized), sub: `${daysElapsed}/${totalDays} dias`, color: "text-primary" },
    { icon: Target, label: "Meta do Período", value: fmt(target), sub: target > 0 ? "Cadastrada" : "Sem meta cadastrada", color: "text-foreground" },
    { icon: Percent, label: "% Atingido", value: `${pct.toFixed(1)}%`, sub: pct >= 100 ? "Meta batida 🎉" : `Faltam ${fmt(Math.max(0, target - realized))}`, color: statusColor, progress: Math.min(pct, 100) },
    { icon: Gauge, label: "Pace (projeção)", value: fmt(pace), sub: `${pacePct.toFixed(0)}% da meta`, color: paceColor },
    { icon: ShoppingBag, label: "Deals fechados", value: dealsRealized.toLocaleString("pt-BR"), sub: dealsTarget > 0 ? `${dealsPct.toFixed(0)}% de ${dealsTarget}` : "Sem meta", color: dealsColor },
  ];

  const netTotal = netMrr?.total ?? 0;
  const netPct = netMrrTarget > 0 ? (netTotal / netMrrTarget) * 100 : 0;
  const netColor =
    netTotal < 0 ? "text-rose-500"
    : netMrrTarget <= 0 ? "text-primary"
    : netPct >= 100 ? "text-emerald-500"
    : netPct >= 70 ? "text-amber-500"
    : "text-rose-500";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</span>
                  <Icon className={`h-4 w-4 ${c.color}`} />
                </div>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.sub}</p>
                {c.progress !== undefined && <Progress value={c.progress} className="h-1.5" />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {netMrr && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                  <Activity className={`h-5 w-5 ${netColor}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Net MRR do período</p>
                  <p className={`text-3xl font-bold ${netColor}`}>{signed(netTotal)}</p>
                  <p className="text-xs text-muted-foreground">
                    {netMrrTarget > 0
                      ? `${netPct.toFixed(0)}% da meta (${fmt(netMrrTarget)})`
                      : "Sem meta cadastrada — categoria Net MRR"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:min-w-[520px]">
                <BreakdownItem label="Novo" value={signed(netMrr.novo)} tone="pos" />
                <BreakdownItem label="Expansão" value={signed(netMrr.expansao)} tone="pos" />
                <BreakdownItem label="Downgrade" value={signed(-netMrr.downgrade)} tone="neg" />
                <BreakdownItem label="Churn" value={signed(-netMrr.churn)} tone="neg" />
              </div>
            </div>
            {netMrrTarget > 0 && (
              <Progress value={Math.max(0, Math.min(netPct, 100))} className="h-1.5 mt-4" />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BreakdownItem({ label, value, tone }: { label: string; value: string; tone: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-600" : "text-rose-500";
  return (
    <div className="rounded-md border border-border/60 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
