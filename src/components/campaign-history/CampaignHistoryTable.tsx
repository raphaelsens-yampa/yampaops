import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  attainmentClass,
  attainmentPct,
  formatMetricValue,
  formatPct,
  groupBySection,
  type HistoryMetric,
  type HistoryValue,
} from "@/lib/campaignHistory";

export function CampaignHistoryTable({
  metrics,
  values,
  campaignId,
}: {
  metrics: HistoryMetric[];
  values: Map<string, HistoryValue>;
  campaignId: string;
}) {
  const groups = groupBySection(metrics);
  const hasFunnel = metrics.some((m) => m.is_funnel);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Indicador</TableHead>
            <TableHead className="text-right">Meta Atual</TableHead>
            <TableHead className="text-right">Realizado Atual</TableHead>
            <TableHead className="text-right">% Ating. Meta</TableHead>
            {hasFunnel && <TableHead className="text-right">% Meta Funil</TableHead>}
            {hasFunnel && <TableHead className="text-right">% Realizado Funil</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <>
              <TableRow key={`s-${group.section}`} className="bg-muted/60 hover:bg-muted/60">
                <TableCell colSpan={hasFunnel ? 6 : 4} className="py-1.5 text-xs font-semibold uppercase tracking-wide">
                  {group.section}
                </TableCell>
              </TableRow>
              {group.metrics.map((m) => {
                const v = values.get(`${campaignId}|${m.id}`);
                const pct = attainmentPct(v?.target_value, v?.actual_value);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMetricValue(v?.target_value ?? null, m.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMetricValue(v?.actual_value ?? null, m.unit)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${attainmentClass(pct, m.direction)}`}>
                      {formatPct(pct)}
                    </TableCell>
                    {hasFunnel && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m.is_funnel ? formatPct(v?.funnel_target_pct ?? null) : ""}
                      </TableCell>
                    )}
                    {hasFunnel && (
                      <TableCell
                        className={`text-right tabular-nums ${
                          m.is_funnel
                            ? attainmentClass(attainmentPct(v?.funnel_target_pct, v?.funnel_actual_pct), m.direction)
                            : ""
                        }`}
                      >
                        {m.is_funnel ? formatPct(v?.funnel_actual_pct ?? null) : ""}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </>
          ))}
          {!metrics.length && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                Nenhum indicador ativo. Cadastre em Configurações de indicadores.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
