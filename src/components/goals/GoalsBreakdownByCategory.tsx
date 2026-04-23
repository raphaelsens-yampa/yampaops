import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AREA_LABELS, formatMetric, type CategoryArea, type GoalCategory } from "@/lib/goalCategories";

export interface CategoryRow {
  category: GoalCategory;
  target: number;
  realized: number;
}

interface Props {
  rows: CategoryRow[];
}

function statusColor(pct: number) {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

function statusLabel(pct: number): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (pct >= 100) return { label: "Atingido", variant: "default" };
  if (pct >= 70) return { label: "No ritmo", variant: "secondary" };
  return { label: "Atrasado", variant: "destructive" };
}

export function GoalsBreakdownByCategory({ rows }: Props) {
  const byArea: Record<CategoryArea, CategoryRow[]> = { sales: [], cs: [], campaign: [], financial: [] };
  rows.forEach(r => byArea[r.category.area].push(r));

  const areas: CategoryArea[] = ["sales", "cs", "campaign", "financial"];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Acompanhamento por Categoria</h3>
      {areas.map(area => {
        const areaRows = byArea[area];
        if (!areaRows.length) return null;
        return (
          <div key={area} className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{AREA_LABELS[area]}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {areaRows.map(({ category, target, realized }) => {
                const pct = target > 0 ? (realized / target) * 100 : 0;
                const status = statusLabel(pct);
                return (
                  <Card key={category.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{category.name}</span>
                        <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold">{formatMetric(realized, category.metric_type)}</span>
                        <span className="text-xs text-muted-foreground">/ {formatMetric(target, category.metric_type)}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className={cn("h-full transition-all", statusColor(pct))} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground text-right">{pct.toFixed(0)}% atingido</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma categoria com meta cadastrada no período.</p>
      )}
    </div>
  );
}
