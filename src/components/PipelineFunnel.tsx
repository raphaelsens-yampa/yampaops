import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  data: Record<string, { count: number; mrr: number }>;
  stageOrder: string[];
  stageLabels: Record<string, string>;
  pipelines?: { id: string; name: string }[];
  selectedPipelineId?: string;
  onPipelineChange?: (id: string) => void;
}

const FUNNEL_COLORS = [
  "hsl(193, 99%, 44%)",   // primary cyan
  "hsl(200, 85%, 48%)",   // blue
  "hsl(210, 78%, 52%)",   // deeper blue
  "hsl(230, 70%, 55%)",   // indigo
  "hsl(260, 65%, 50%)",   // purple
  "hsl(280, 60%, 48%)",   // violet
  "hsl(320, 65%, 50%)",   // magenta
  "hsl(152, 60%, 42%)",   // green (won)
  "hsl(0, 65%, 50%)",     // red (lost)
];

export function PipelineFunnel({
  data, stageOrder, stageLabels,
  pipelines, selectedPipelineId, onPipelineChange,
}: Props) {
  const stages = stageOrder;
  const maxCount = Math.max(...stages.map(s => data[s]?.count || 0), 1);
  const totalStages = stages.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-lg">Funil de Pipeline</CardTitle>
        {pipelines && pipelines.length > 0 && onPipelineChange && (
          <Select value={selectedPipelineId || "all"} onValueChange={onPipelineChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="space-y-0 pb-6">
        {stages.map((stage, i) => {
          const d = data[stage] || { count: 0, mrr: 0 };
          const prevCount = i > 0 ? (data[stages[i - 1]]?.count || 0) : 0;
          const convRate = i > 0 && prevCount > 0 ? ((d.count / prevCount) * 100).toFixed(0) : null;

          // Funnel shape: widest at top, narrowing down
          const widthPercent = totalStages > 1
            ? 100 - ((i / (totalStages - 1)) * 50)
            : 100;

          const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];

          return (
            <div key={stage} className="flex flex-col items-center">
              {/* Connector arrow between stages */}
              {i > 0 && (
                <div className="flex items-center justify-center h-4 relative w-full">
                  {convRate && (
                    <span className="text-[10px] font-medium text-muted-foreground bg-background px-1.5 rounded z-10">
                      ↓ {convRate}%
                    </span>
                  )}
                </div>
              )}
              {/* Funnel bar */}
              <div
                className="relative rounded-md overflow-hidden transition-all duration-300 group cursor-default"
                style={{
                  width: `${widthPercent}%`,
                  height: "42px",
                  background: color,
                }}
              >
                {/* Fill based on count */}
                <div
                  className="absolute inset-0 transition-all duration-500"
                  style={{
                    background: `linear-gradient(90deg, ${color} 0%, ${color}dd ${Math.max((d.count / maxCount) * 100, 5)}%, transparent ${Math.max((d.count / maxCount) * 100, 5)}%)`,
                    opacity: 0.3,
                  }}
                />
                {/* Content */}
                <div className="absolute inset-0 flex items-center justify-between px-3 text-white">
                  <span className="text-xs font-semibold truncate drop-shadow-sm">
                    {stageLabels[stage] || stage}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold drop-shadow-sm">{d.count}</span>
                    <span className="text-[11px] opacity-80 drop-shadow-sm">
                      R$ {d.mrr.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
