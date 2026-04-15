import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  data: Record<string, { count: number; mrr: number }>;
  stageOrder: string[];
  stageLabels: Record<string, string>;
}

export function PipelineFunnel({ data, stageOrder, stageLabels }: Props) {
  const stages = stageOrder;
  const maxCount = Math.max(...stages.map(s => data[s]?.count || 0), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Funil de Pipeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage, i) => {
          const d = data[stage] || { count: 0, mrr: 0 };
          const width = Math.max((d.count / maxCount) * 100, 8);
          const prevCount = i > 0 ? (data[stages[i - 1]]?.count || 0) : 0;
          const convRate = i > 0 && prevCount > 0 ? ((d.count / prevCount) * 100).toFixed(0) : null;

          return (
            <div key={stage} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stageLabels[stage] || stage}</span>
                <div className="flex items-center gap-3">
                  {convRate && <span className="text-xs text-muted-foreground">{convRate}%</span>}
                  <span className="font-medium">{d.count}</span>
                  <span className="text-xs text-muted-foreground">R$ {d.mrr.toLocaleString("pt-BR")}</span>
                </div>
              </div>
              <div className="h-7 bg-muted rounded-md overflow-hidden">
                <div
                  className="h-full rounded-md bg-primary/80 transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
