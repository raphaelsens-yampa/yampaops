import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { averageFunnelKpis, buildCoverage, type PlanRow } from "@/lib/commercialPlan";
import type { FunnelKpiMonth } from "@/hooks/useCommercialPlan";

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]}/${String(y).slice(2)}`;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtInt = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("pt-BR");

interface Props {
  funnels: Array<{ ac_group_id: string; title: string; is_connected: boolean | null }>;
  funnelId: string;
  onFunnelChange: (id: string) => void;
  kpis: FunnelKpiMonth[];
  openPipeline: number | null;
  rows: PlanRow[];
  currentMonth: string;
  loading: boolean;
  hasFunnelData: boolean;
}

export function PipelineCoverage({ funnels, funnelId, onFunnelChange, kpis, openPipeline, rows, currentMonth, loading, hasFunnelData }: Props) {
  const [targetCoverage, setTargetCoverage] = useState(1);

  const avgKpis = useMemo(() => averageFunnelKpis(kpis), [kpis]);

  const futureRows = useMemo(
    () => rows.filter((r) => r.yearMonth >= currentMonth),
    [rows, currentMonth],
  );

  const coverageRows = useMemo(
    () =>
      futureRows.map((r) => ({
        row: r,
        coverage: buildCoverage({
          dealsNeeded: r.dealsTarget,
          winRatePct: avgKpis.winRate,
          avgTicket: avgKpis.avgTicket,
          pipelineCurrent: openPipeline,
          targetCoverage,
        }),
      })),
    [futureRows, avgKpis, openPipeline, targetCoverage],
  );

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading font-semibold text-base">Cobertura de pipeline</h3>
            <p className="text-sm text-muted-foreground">
              Cálculo reverso com as taxas do Funil CRM: entradas necessárias = meta de deals ÷ % Ganho;
              pipeline necessário = entradas × ticket médio ganho.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Funil CRM</Label>
              <Select value={funnelId} onValueChange={onFunnelChange}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => (
                    <SelectItem key={f.ac_group_id} value={f.ac_group_id}>
                      {f.title}{f.is_connected ? "" : " (sem sync)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cobertura alvo</Label>
              <Input
                className="w-24 h-9 text-right"
                inputMode="decimal"
                value={targetCoverage}
                onChange={(e) => setTargetCoverage(Math.max(0, Number(e.target.value.replace(",", ".")) || 0))}
              />
            </div>
          </div>
        </div>

        {!funnelId && (
          <p className="text-sm text-muted-foreground">Selecione um funil do ActiveCampaign para calcular a cobertura.</p>
        )}

        {funnelId && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">% Ganho (média dos últimos {kpis.length} meses fechados)</p>
                <p className="text-xl font-heading font-semibold">
                  {avgKpis.winRate != null ? `${avgKpis.winRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ticket médio ganho</p>
                <p className="text-xl font-heading font-semibold">{fmtBRL(avgKpis.avgTicket)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Pipeline aberto hoje (R$)</p>
                <p className="text-xl font-heading font-semibold">{fmtBRL(openPipeline)}</p>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando taxas do funil...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Deals alvo</TableHead>
                      <TableHead className="text-right">Entradas necessárias</TableHead>
                      <TableHead className="text-right">Pipeline necessário</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverageRows.map(({ row, coverage }) => (
                      <TableRow key={row.yearMonth}>
                        <TableCell className="whitespace-nowrap">{monthLabel(row.yearMonth)}</TableCell>
                        <TableCell className="text-right">{fmtInt(row.dealsTarget)}</TableCell>
                        <TableCell className="text-right">{fmtInt(coverage.entradasNecessarias)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(coverage.pipelineNecessario)}</TableCell>
                        <TableCell className="text-right">
                          {coverage.coveragePct != null
                            ? `${coverage.coveragePct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {coverage.ok === true && <Badge className="bg-emerald-500">suficiente</Badge>}
                          {coverage.ok === false && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" /> lacuna
                            </Badge>
                          )}
                          {coverage.ok === null && <Badge variant="outline">sem taxa</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {funnelId && !loading && !hasFunnelData && (
              <p className="text-sm text-muted-foreground">
                O funil selecionado não tem negócios sincronizados ainda — conecte a integração do ActiveCampaign para habilitar as taxas.
              </p>
            )}
            {funnelId && !loading && hasFunnelData && avgKpis.winRate == null && (
              <p className="text-sm text-muted-foreground">
                Nenhum fechamento nos últimos meses fechados deste funil — a cobertura fica indisponível até haver ganhos/perdas registrados.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
