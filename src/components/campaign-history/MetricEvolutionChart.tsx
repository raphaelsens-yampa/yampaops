import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  campaignLabel,
  formatMetricValue,
  type HistoryCampaign,
  type HistoryMetric,
  type HistoryValue,
} from "@/lib/campaignHistory";

type SeriesType = "line" | "bar";
const NONE = "__none__";

export function MetricEvolutionChart({
  metrics,
  campaigns,
  values,
}: {
  metrics: HistoryMetric[];
  campaigns: HistoryCampaign[];
  values: Map<string, HistoryValue>;
}) {
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "");
  const [metricId2, setMetricId2] = useState<string>(NONE);
  const [chartType, setChartType] = useState<SeriesType>("line");
  const [chartType2, setChartType2] = useState<SeriesType>("bar");
  const [showTargets, setShowTargets] = useState(true);
  const [viewMode, setViewMode] = useState<"both" | "real" | "meta">("both");

  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  const metric2 = metricId2 === NONE ? undefined : metrics.find((m) => m.id === metricId2);

  const data = useMemo(
    () =>
      campaigns.map((c) => {
        const v = metric ? values.get(`${c.id}|${metric.id}`) : undefined;
        const v2 = metric2 ? values.get(`${c.id}|${metric2.id}`) : undefined;
        return {
          name: campaignLabel(c),
          metaA: v?.target_value ?? null,
          realA: v?.actual_value ?? null,
          metaB: v2?.target_value ?? null,
          realB: v2?.actual_value ?? null,
        };
      }),
    [campaigns, metric, metric2, values],
  );

  if (!metric) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Cadastre indicadores para visualizar a evolução.
        </CardContent>
      </Card>
    );
  }

  const unitByKey: Record<string, string | undefined> = {
    metaA: metric.unit,
    realA: metric.unit,
    metaB: metric2?.unit,
    realB: metric2?.unit,
  };
  const labelByKey: Record<string, string> = {
    metaA: `Meta — ${metric.label}`,
    realA: `Realizado — ${metric.label}`,
    metaB: metric2 ? `Meta — ${metric2.label}` : "",
    realB: metric2 ? `Realizado — ${metric2.label}` : "",
  };

  const seriesA = (key: "metaA" | "realA", isTarget: boolean) =>
    chartType === "line" ? (
      <Line
        key={key}
        yAxisId="left"
        type="monotone"
        dataKey={key}
        name={labelByKey[key]}
        stroke={isTarget ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"}
        strokeDasharray={isTarget ? "4 4" : undefined}
        strokeWidth={isTarget ? 1.5 : 2}
        dot={!isTarget}
      />
    ) : (
      <Bar
        key={key}
        yAxisId="left"
        dataKey={key}
        name={labelByKey[key]}
        fill={isTarget ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))"}
        radius={[4, 4, 0, 0]}
      />
    );

  const seriesB = (key: "metaB" | "realB", isTarget: boolean) =>
    chartType2 === "line" ? (
      <Line
        key={key}
        yAxisId="right"
        type="monotone"
        dataKey={key}
        name={labelByKey[key]}
        stroke={isTarget ? "hsl(var(--muted-foreground))" : "hsl(var(--secondary))"}
        strokeDasharray={isTarget ? "4 4" : undefined}
        strokeWidth={isTarget ? 1.5 : 2}
        dot={!isTarget}
      />
    ) : (
      <Bar
        key={key}
        yAxisId="right"
        dataKey={key}
        name={labelByKey[key]}
        fill={isTarget ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--secondary))"}
        radius={[4, 4, 0, 0]}
      />
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle className="text-base">Evolução por campanha</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={metric.id} onValueChange={setMetricId}>
                <SelectTrigger className="h-9 flex-1 min-w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button size="sm" variant={chartType === "line" ? "default" : "outline"} onClick={() => setChartType("line")}>Linha</Button>
                <Button size="sm" variant={chartType === "bar" ? "default" : "outline"} onClick={() => setChartType("bar")}>Barra</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={metricId2} onValueChange={setMetricId2}>
                <SelectTrigger className="h-9 flex-1 min-w-[180px]"><SelectValue placeholder="Comparar com..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem comparação</SelectItem>
                  {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button size="sm" disabled={!metric2} variant={chartType2 === "line" ? "default" : "outline"} onClick={() => setChartType2("line")}>Linha</Button>
                <Button size="sm" disabled={!metric2} variant={chartType2 === "bar" ? "default" : "outline"} onClick={() => setChartType2("bar")}>Barra</Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Visualizar:</span>
            <Button size="sm" variant={viewMode === "both" ? "default" : "outline"} onClick={() => setViewMode("both")}>Ambos</Button>
            <Button size="sm" variant={viewMode === "real" ? "default" : "outline"} onClick={() => setViewMode("real")}>Realizado</Button>
            <Button size="sm" variant={viewMode === "meta" ? "default" : "outline"} onClick={() => setViewMode("meta")}>Meta</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatMetricValue(v, metric.unit)} width={80} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  hide={!metric2}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatMetricValue(v, metric2?.unit)}
                  width={80}
                />
                <Tooltip
                  formatter={(v: any, name: any, item: any) =>
                    [formatMetricValue(v, unitByKey[item?.dataKey as string]), name]
                  }
                />
                <Legend />
                {viewMode !== "real" && seriesA("metaA", true)}
                {viewMode !== "meta" && seriesA("realA", false)}
                {metric2 && viewMode !== "real" && seriesB("metaB", true)}
                {metric2 && viewMode !== "meta" && seriesB("realB", false)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matriz histórica — Realizado</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">{campaigns.length} campanhas</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Indicador</TableHead>
                {campaigns.map((c) => (
                  <TableHead key={c.id} className="whitespace-nowrap text-right text-xs">{campaignLabel(c)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  {campaigns.map((c) => (
                    <TableCell key={c.id} className="text-right tabular-nums text-xs">
                      {formatMetricValue(values.get(`${c.id}|${m.id}`)?.actual_value ?? null, m.unit)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
