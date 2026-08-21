import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];

  const data = useMemo(
    () =>
      campaigns.map((c) => {
        const v = metric ? values.get(`${c.id}|${metric.id}`) : undefined;
        return {
          name: campaignLabel(c),
          Meta: v?.target_value ?? null,
          Realizado: v?.actual_value ?? null,
        };
      }),
    [campaigns, metric, values],
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Evolução por campanha</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={metric.id} onValueChange={setMetricId}>
              <SelectTrigger className="h-9 w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button size="sm" variant={chartType === "line" ? "default" : "outline"} onClick={() => setChartType("line")}>Linhas</Button>
              <Button size="sm" variant={chartType === "bar" ? "default" : "outline"} onClick={() => setChartType("bar")}>Barras</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMetricValue(v, metric.unit)} width={80} />
                  <Tooltip formatter={(v: any) => formatMetricValue(v, metric.unit)} />
                  <Legend />
                  <Line type="monotone" dataKey="Meta" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="Realizado" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMetricValue(v, metric.unit)} width={80} />
                  <Tooltip formatter={(v: any) => formatMetricValue(v, metric.unit)} />
                  <Legend />
                  <Bar dataKey="Meta" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
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
