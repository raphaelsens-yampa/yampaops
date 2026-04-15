import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { FUNNEL_TRANSITIONS, SAAS_BENCHMARKS } from "@/lib/constants";

interface ConversionRatesProps {
  actualRates: Record<string, number | null>;
  stageCounts: Record<string, number>;
}

export function ConversionRates({ actualRates, stageCounts }: ConversionRatesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Taxas de Conversão por Etapa</CardTitle>
        <CardDescription>Realizado vs. Benchmark SaaS de mercado</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transição</TableHead>
              <TableHead className="text-center">Volume (De)</TableHead>
              <TableHead className="text-center">Volume (Para)</TableHead>
              <TableHead className="text-center">Taxa Atual</TableHead>
              <TableHead className="text-center">Benchmark SaaS</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FUNNEL_TRANSITIONS.map((t) => {
              const benchmark = SAAS_BENCHMARKS[t.benchmarkKey];
              const actual = actualRates[t.key];
              const fromCount = stageCounts[t.from] ?? 0;
              const toCount = stageCounts[t.to] ?? 0;
              const hasData = actual !== null && fromCount > 0;

              let statusIcon = <Minus className="h-4 w-4 text-muted-foreground" />;
              let statusBadge = <Badge variant="secondary">Sem dados</Badge>;

              if (hasData && actual !== null) {
                const diff = actual - benchmark;
                if (diff >= 0.02) {
                  statusIcon = <ArrowUp className="h-4 w-4 text-green-500" />;
                  statusBadge = <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Acima</Badge>;
                } else if (diff <= -0.02) {
                  statusIcon = <ArrowDown className="h-4 w-4 text-red-500" />;
                  statusBadge = <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Abaixo</Badge>;
                } else {
                  statusBadge = <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Na média</Badge>;
                }
              }

              return (
                <TableRow key={t.key}>
                  <TableCell className="font-medium">{t.label}</TableCell>
                  <TableCell className="text-center">{fromCount}</TableCell>
                  <TableCell className="text-center">{toCount}</TableCell>
                  <TableCell className="text-center">
                    {hasData ? (
                      <span className="font-semibold">{(actual! * 100).toFixed(1)}%</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {(benchmark * 100).toFixed(0)}%
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
