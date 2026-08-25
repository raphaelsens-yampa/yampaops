import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CollapseToggle } from "@/components/goals/tactical/CollapseToggle";
import {
  buildCohortMatrix,
  formatBRL,
  type CohortMatrixCell,
  type CohortRow,
  type CurvePoint,
} from "@/lib/campaignCohort";

type Mode = "retention" | "clients" | "mrr";

const MODE_LABEL: Record<Mode, string> = {
  retention: "% de retenção",
  clients: "Clientes ativos",
  mrr: "MRR retido",
};

function pct(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function cellText(cell: CohortMatrixCell, mode: Mode) {
  if (mode === "clients") return cell.active.toLocaleString("pt-BR");
  if (mode === "mrr") return formatBRL(cell.mrr);
  return `${Math.round(cell.retention_pct)}%`;
}

/** Escala de azuis do design system: mais escuro = maior retenção. */
function cellStyle(cell: CohortMatrixCell) {
  const r = Math.max(0, Math.min(100, cell.retention_pct));
  const alpha = 0.12 + (r / 100) * 0.88;
  return {
    backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(2)})`,
    color: r >= 45 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
  };
}

export function CohortRetentionChart({ curve, rows }: { curve: CurvePoint[]; rows: CohortRow[] }) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>("retention");

  const matrix = useMemo(() => buildCohortMatrix(rows ?? []), [rows]);
  const maxCols = useMemo(
    () => matrix.reduce((acc, r) => Math.max(acc, r.cells.length), 0),
    [matrix],
  );
  const cols = Array.from({ length: maxCols }, (_, i) => i);

  const aggregate = curve ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Retenção de assinantes (M0 em diante)</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CollapseToggle open={open} onToggle={() => setOpen((o) => !o)} />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {!matrix.length ? (
            <p className="text-sm text-muted-foreground">
              Sem dados de ativação suficientes para montar a matriz. Importe a lista com a data de ativação e recalcule o cohort.
            </p>
          ) : (
            <TooltipProvider delayDuration={80}>
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-1 text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="px-1 py-1 text-left font-medium">Cohort</th>
                      <th className="px-1 py-1 text-right font-medium">Clientes</th>
                      {cols.map((c) => (
                        <th key={c} className="w-12 px-1 py-1 text-center font-medium">M{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row) => (
                      <tr key={row.key}>
                        <td className="whitespace-nowrap px-1 py-1 font-medium">{row.label}</td>
                        <td className="px-1 py-1 text-right tabular-nums text-muted-foreground">{row.size}</td>
                        {cols.map((c) => {
                          const cell = row.cells[c];
                          if (!cell) return <td key={c} className="w-12" />;
                          return (
                            <td key={c} className="w-12 p-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="flex h-9 w-full cursor-default items-center justify-center rounded-sm text-[11px] font-semibold tabular-nums transition-transform hover:scale-[1.06]"
                                    style={cellStyle(cell)}
                                  >
                                    {cellText(cell, mode)}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <div className="font-semibold">{row.label} · M{cell.offset}</div>
                                  <div>Retenção: {pct(cell.retention_pct)}</div>
                                  <div>Ativos: {cell.active} de {cell.size}</div>
                                  <div>MRR retido: {formatBRL(cell.mrr)}</div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TooltipProvider>
          )}

          {!!aggregate.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">Consolidado</th>
                    {aggregate.map((d) => (
                      <th key={d.month_offset} className="px-2 py-1.5 text-right">M{d.month_offset}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-2 py-1.5 text-muted-foreground">Ativos</td>
                    {aggregate.map((d) => (
                      <td key={d.month_offset} className="px-2 py-1.5 text-right tabular-nums">{d.active_count}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="px-2 py-1.5 text-muted-foreground">MRR</td>
                    {aggregate.map((d) => (
                      <td key={d.month_offset} className="px-2 py-1.5 text-right tabular-nums">{formatBRL(d.mrr_total)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-muted-foreground">Retenção</td>
                    {aggregate.map((d) => (
                      <td key={d.month_offset} className="px-2 py-1.5 text-right tabular-nums">
                        {d.retention_pct == null ? "—" : pct(d.retention_pct)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
