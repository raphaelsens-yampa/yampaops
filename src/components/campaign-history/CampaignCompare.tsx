import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  attainmentClass,
  attainmentPct,
  campaignLabel,
  formatMetricValue,
  formatPct,
  groupBySection,
  isImprovement,
  variationPct,
  type HistoryCampaign,
  type HistoryMetric,
  type HistoryValue,
} from "@/lib/campaignHistory";

export function CampaignCompare({
  metrics,
  campaigns,
  values,
  aId,
  bId,
  onChangeA,
  onChangeB,
}: {
  metrics: HistoryMetric[];
  campaigns: HistoryCampaign[];
  values: Map<string, HistoryValue>;
  aId: string;
  bId: string;
  onChangeA: (v: string) => void;
  onChangeB: (v: string) => void;
}) {
  const a = campaigns.find((c) => c.id === aId);
  const b = campaigns.find((c) => c.id === bId);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Comparar campanhas</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={aId} onValueChange={onChangeA}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Campanha A" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bId} onValueChange={onChangeB}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Campanha B" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!a || !b ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Selecione duas campanhas para comparar.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Indicador</TableHead>
                <TableHead className="text-right">Meta A</TableHead>
                <TableHead className="text-right">Real. A</TableHead>
                <TableHead className="text-right">% A</TableHead>
                <TableHead className="text-right">Meta B</TableHead>
                <TableHead className="text-right">Real. B</TableHead>
                <TableHead className="text-right">% B</TableHead>
                <TableHead className="text-right">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupBySection(metrics).map((group) => (
                <>
                  <TableRow key={`s-${group.section}`} className="bg-muted/60 hover:bg-muted/60">
                    <TableCell colSpan={8} className="py-1 text-xs font-semibold uppercase">{group.section}</TableCell>
                  </TableRow>
                  {group.metrics.map((m) => {
                    const va = values.get(`${a.id}|${m.id}`);
                    const vb = values.get(`${b.id}|${m.id}`);
                    const pa = attainmentPct(va?.target_value, va?.actual_value);
                    const pb = attainmentPct(vb?.target_value, vb?.actual_value);
                    const vp = variationPct(va?.actual_value ?? null, vb?.actual_value ?? null);
                    const better = isImprovement(vp, m.direction);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetricValue(va?.target_value ?? null, m.unit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetricValue(va?.actual_value ?? null, m.unit)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${attainmentClass(pa, m.direction)}`}>{formatPct(pa)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetricValue(vb?.target_value ?? null, m.unit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetricValue(vb?.actual_value ?? null, m.unit)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${attainmentClass(pb, m.direction)}`}>{formatPct(pb)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {vp === null ? (
                            "—"
                          ) : (
                            <span className={`inline-flex items-center gap-1 ${better === null ? "" : better ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                              {vp > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                              {`${vp > 0 ? "+" : ""}${vp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
