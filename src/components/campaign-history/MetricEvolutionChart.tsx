import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import {
  buildCohortMatrix,
  type CohortContact,
  type CohortResult,
  type CohortRow,
} from "@/lib/campaignCohort";
import {
  campaignLabel,
  formatMetricValue,
  type HistoryCampaign,
  type HistoryMetric,
  type HistoryValue,
} from "@/lib/campaignHistory";

const RETENTION_ID = "cohort_retention";

/** Retenção ponderada do cohort da campanha no mês mais recente disponível. */
function retentionLatest(rows: CohortRow[]) {
  const matrix = buildCohortMatrix(rows);
  let maxOffset = -1;
  let active = 0;
  let size = 0;
  for (const r of matrix) {
    for (const c of r.cells) {
      if (c.offset === maxOffset) {
        active += c.active;
        size += c.size;
      } else if (c.offset > maxOffset) {
        maxOffset = c.offset;
        active = c.active;
        size = c.size;
      }
    }
  }
  if (!size) return { pct: null as number | null, active: 0, size: 0 };
  return { pct: (active / size) * 100, active, size };
}

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
  const [viewMode, setViewMode] = useState<"both" | "real" | "meta">("both");

  const isRetention = metricId === RETENTION_ID;
  const isRetention2 = metricId2 === RETENTION_ID;

  useEffect(() => {
    if (isRetention || isRetention2) setViewMode("real");
  }, [isRetention, isRetention2]);

  const cohortQ = useQuery({
    queryKey: ["cohort-evolution-all"],
    queryFn: async () => {
      const [contactsRes, resultsRes] = await Promise.all([
        supabase
          .from("campaign_cohort_contacts")
          .select("id, campaign_id, email, email_norm, name, offer, activated_at"),
        supabase.from("campaign_cohort_results").select("*"),
      ]);
      if (contactsRes.error) throw contactsRes.error;
      if (resultsRes.error) throw resultsRes.error;

      const results = new Map<string, CohortResult>();
      for (const r of (resultsRes.data ?? []) as unknown as CohortResult[]) results.set(r.contact_id, r);

      const byCampaign = new Map<string, CohortRow[]>();
      for (const c of (contactsRes.data ?? []) as unknown as CohortContact[]) {
        const list = byCampaign.get(c.campaign_id) ?? [];
        list.push({ ...c, result: results.get(c.id) ?? null });
        byCampaign.set(c.campaign_id, list);
      }
      return byCampaign;
    },
    enabled: isRetention || isRetention2,
  });

  const cohortByCampaign = cohortQ.data ?? new Map<string, CohortRow[]>();

  const metric = isRetention
    ? ({ id: RETENTION_ID, label: "% de Retenção", slug: "retencao", unit: "percent", is_active: true, section: "Cohort", position: -1 } as HistoryMetric)
    : metrics.find((m) => m.id === metricId) ?? metrics[0];
  const metric2 = metricId2 === NONE
    ? undefined
    : isRetention2
    ? ({ id: RETENTION_ID, label: "% de Retenção", slug: "retencao", unit: "percent", is_active: true, section: "Cohort", position: -1 } as HistoryMetric)
    : metrics.find((m) => m.id === metricId2);

  const data = useMemo(
    () =>
      campaigns.map((c) => {
        const v = metric && !isRetention ? values.get(`${c.id}|${metric.id}`) : undefined;
        const v2 = metric2 && !isRetention2 ? values.get(`${c.id}|${metric2.id}`) : undefined;
        const rows = cohortByCampaign.get(c.id) ?? [];
        const retention = isRetention ? retentionAtOffset(rows, retentionOffset) : null;
        const retention2 = isRetention2 ? retentionAtOffset(rows, retentionOffset) : null;
        return {
          name: campaignLabel(c),
          metaA: isRetention ? null : (v?.target_value ?? null),
          realA: isRetention ? retention.pct : (v?.actual_value ?? null),
          metaB: isRetention2 ? null : (v2?.target_value ?? null),
          realB: isRetention2 ? retention2.pct : (v2?.actual_value ?? null),
          baseA: retention?.size ?? 0,
          baseB: retention2?.size ?? 0,
        };
      }),
    [campaigns, metric, metric2, values, isRetention, isRetention2, retentionOffset, cohortByCampaign],
  );

  if (!metric && !metrics.length) {
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
    baseA: "number",
    baseB: "number",
  };
  const labelByKey: Record<string, string> = {
    metaA: isRetention ? "" : `Meta — ${metric.label}`,
    realA: isRetention ? `${metric.label} (M${retentionOffset})` : `Realizado — ${metric.label}`,
    metaB: metric2 ? (isRetention2 ? "" : `Meta — ${metric2.label}`) : "",
    realB: metric2
      ? isRetention2
        ? `${metric2.label} (M${retentionOffset})`
        : `Realizado — ${metric2.label}`
      : "",
    baseA: isRetention ? `Base do cohort (M${retentionOffset})` : "",
    baseB: isRetention2 ? `Base do cohort (M${retentionOffset})` : "",
  };

  const paletteA = {
    solid: "hsl(var(--primary))",
    light: "hsl(var(--primary) / 0.45)",
    lineMeta: "hsl(var(--primary) / 0.65)",
  };
  const paletteB = {
    solid: "hsl(var(--chart-logo))",
    light: "hsl(var(--chart-logo-soft))",
    lineMeta: "hsl(var(--chart-logo-soft))",
  };


  const seriesA = (key: "metaA" | "realA", isTarget: boolean) =>
    chartType === "line" ? (
      <Line
        key={key}
        yAxisId="left"
        type="monotone"
        dataKey={key}
        name={labelByKey[key]}
        stroke={isTarget ? paletteA.lineMeta : paletteA.solid}
        strokeDasharray={isTarget ? "5 5" : undefined}
        strokeWidth={isTarget ? 2 : 3}
        dot={!isTarget}
        activeDot={{ r: 5 }}
      />
    ) : (
      <Bar
        key={key}
        yAxisId="left"
        dataKey={key}
        name={labelByKey[key]}
        fill={isTarget ? paletteA.light : paletteA.solid}
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
        stroke={isTarget ? paletteB.lineMeta : paletteB.solid}
        strokeDasharray={isTarget ? "5 5" : undefined}
        strokeWidth={isTarget ? 2 : 3}
        dot={!isTarget}
        activeDot={{ r: 5 }}
      />
    ) : (
      <Bar
        key={key}
        yAxisId="right"
        dataKey={key}
        name={labelByKey[key]}
        fill={isTarget ? paletteB.light : paletteB.solid}
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
              <Select value={metricId} onValueChange={setMetricId}>
                <SelectTrigger className="h-9 flex-1 min-w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  <SelectItem value={RETENTION_ID}>% de Retenção</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button size="sm" variant={chartType === "line" ? "default" : "outline"} onClick={() => setChartType("line")}>Linha</Button>
                <Button size="sm" variant={chartType === "bar" ? "default" : "outline"} onClick={() => setChartType("bar")}>Barra</Button>
              </div>
              {isRetention && (
                <Select value={String(retentionOffset)} onValueChange={(v) => setRetentionOffset(Number(v))}>
                  <SelectTrigger className="h-9 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OFFSETS.map((o) => <SelectItem key={o} value={String(o)}>M{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={metricId2} onValueChange={setMetricId2}>
                <SelectTrigger className="h-9 flex-1 min-w-[180px]"><SelectValue placeholder="Comparar com..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem comparação</SelectItem>
                  {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  <SelectItem value={RETENTION_ID}>% de Retenção</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button size="sm" disabled={!metric2} variant={chartType2 === "line" ? "default" : "outline"} onClick={() => setChartType2("line")}>Linha</Button>
                <Button size="sm" disabled={!metric2} variant={chartType2 === "bar" ? "default" : "outline"} onClick={() => setChartType2("bar")}>Barra</Button>
              </div>
              {isRetention2 && (
                <Select value={String(retentionOffset)} onValueChange={(v) => setRetentionOffset(Number(v))}>
                  <SelectTrigger className="h-9 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OFFSETS.map((o) => <SelectItem key={o} value={String(o)}>M{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Visualizar:</span>
            <Button size="sm" variant={viewMode === "both" ? "default" : "outline"} onClick={() => setViewMode("both")} disabled={isRetention || isRetention2}>Ambos</Button>
            <Button size="sm" variant={viewMode === "real" ? "default" : "outline"} onClick={() => setViewMode("real")}>Realizado</Button>
            <Button size="sm" variant={viewMode === "meta" ? "default" : "outline"} onClick={() => setViewMode("meta")} disabled={isRetention || isRetention2}>Meta</Button>
          </div>
        </CardHeader>
        <CardContent>
          {cohortQ.isLoading && (isRetention || isRetention2) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando cohort…</p>
          ) : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  domain={isRetention ? [0, 100] : ["auto", "auto"]}
                  tickFormatter={(v) => formatMetricValue(v, metric.unit)}
                  width={80}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  hide={!metric2}
                  tick={{ fontSize: 11 }}
                  domain={isRetention2 ? [0, 100] : ["auto", "auto"]}
                  tickFormatter={(v) => formatMetricValue(v, metric2?.unit)}
                  width={80}
                />
                <Tooltip
                  formatter={(v: any, name: any, item: any) =>
                    [formatMetricValue(v, unitByKey[item?.dataKey as string]), name]
                  }
                />
                <Legend />
                {viewMode !== "real" && !isRetention && seriesA("metaA", true)}
                {((viewMode !== "meta" && !isRetention) || isRetention) && seriesA("realA", false)}
                {metric2 && viewMode !== "real" && !isRetention2 && seriesB("metaB", true)}
                {metric2 && ((viewMode !== "meta" && !isRetention2) || isRetention2) && seriesB("realB", false)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}
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
