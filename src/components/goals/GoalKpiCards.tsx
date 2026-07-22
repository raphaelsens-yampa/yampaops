import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Target, Percent, Gauge, ShoppingBag } from "lucide-react";

interface Props {
  realized: number;
  target: number;
  pace: number;
  daysElapsed: number;
  totalDays: number;
  dealsRealized?: number;
  dealsTarget?: number;
}

const fmt = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export function GoalKpiCards({ realized, target, pace, daysElapsed, totalDays, dealsRealized = 0, dealsTarget = 0 }: Props) {
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

  return (
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
  );
}
