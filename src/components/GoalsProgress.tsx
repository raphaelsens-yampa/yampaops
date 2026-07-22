import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface GoalData {
  label?: string | null;
  target_mrr: number;
  achieved_mrr: number;
  weighted_pipeline: number;
}

interface Props {
  goals: GoalData[];
}

export function GoalsProgress({ goals }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Metas vs. Realizado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.map((g, i) => {
          const pct = g.target_mrr > 0 ? Math.min((g.achieved_mrr / g.target_mrr) * 100, 100) : 0;
          const gap = Math.max(g.target_mrr - g.achieved_mrr, 0);
          const probability = g.target_mrr > 0
            ? Math.min(((g.achieved_mrr + g.weighted_pipeline) / g.target_mrr) * 100, 100)
            : 0;

          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{g.label || "Total"}</span>
                <span className="text-muted-foreground">
                  R$ {g.achieved_mrr.toLocaleString("pt-BR")} / R$ {g.target_mrr.toLocaleString("pt-BR")}
                </span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Gap: R$ {gap.toLocaleString("pt-BR")}</span>
                <span>Prob: {probability.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
        {goals.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma meta definida.</p>
        )}
      </CardContent>
    </Card>
  );
}
