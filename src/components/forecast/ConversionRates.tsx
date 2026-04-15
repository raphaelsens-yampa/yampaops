import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { DynamicTransition } from "@/pages/Forecast";

interface StageGoals {
  target_prospeccoes: number;
  target_respostas: number;
  target_agendamentos: number;
  target_comparecimentos: number;
  target_conversoes: number;
  target_taxa_resposta: number | null;
  target_taxa_agendamento: number | null;
  target_taxa_comparecimento: number | null;
  target_taxa_conversao: number | null;
}

interface ConversionRatesProps {
  actualRates: Record<string, number | null>;
  stageCounts: Record<string, number>;
  stageGoals: StageGoals;
  transitions: DynamicTransition[];
  stageLabels: Record<string, string>;
}

const DEFAULT_BENCHMARK = 0.25; // fallback benchmark when no specific one exists

export function ConversionRates({ actualRates, stageCounts, stageGoals, transitions, stageLabels }: ConversionRatesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Taxas de Conversão por Etapa</CardTitle>
        <CardDescription>Realizado vs. Meta — taxas de conversão entre etapas do pipeline</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transição</TableHead>
              <TableHead className="text-center">Realizado</TableHead>
              <TableHead className="text-center">Taxa Atual</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(transitions ?? []).map((t) => {
              const actual = actualRates[t.key];
              const realizedValue = stageCounts[t.toSlug] ?? 0;

              const hasData = actual !== null && realizedValue > 0;

              let statusIcon = <Minus className="h-4 w-4 text-muted-foreground" />;
              let statusBadge = <Badge variant="secondary">Sem dados</Badge>;

              if (hasData && actual !== null) {
                if (actual >= 0.5) {
                  statusIcon = <ArrowUp className="h-4 w-4 text-green-500" />;
                  statusBadge = <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Ótimo</Badge>;
                } else if (actual >= DEFAULT_BENCHMARK) {
                  statusBadge = <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Na média</Badge>;
                } else {
                  statusIcon = <ArrowDown className="h-4 w-4 text-red-500" />;
                  statusBadge = <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Abaixo</Badge>;
                }
              }

              return (
                <TableRow key={t.key}>
                  <TableCell className="font-medium">{t.label}</TableCell>
                  <TableCell className="text-center font-semibold">
                    {realizedValue}
                  </TableCell>
                  <TableCell className="text-center">
                    {hasData ? (
                      <span className="font-semibold">{(actual! * 100).toFixed(1)}%</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center flex items-center justify-center gap-1">
                    {statusIcon}
                    {statusBadge}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
