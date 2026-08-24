import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollapseToggle } from "@/components/goals/tactical/CollapseToggle";
import { formatBRL, type CurvePoint } from "@/lib/campaignCohort";

type Mode = "clients" | "mrr" | "retention";

const MODE_LABEL: Record<Mode, string> = {
  clients: "Clientes ativos",
  mrr: "MRR retido",
  retention: "% de retenção",
};

export function CohortRetentionChart({ curve }: { curve: CurvePoint[] }) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>("clients");

  const data = curve.map((p) => ({
    label: `M${p.month_offset}`,
    clients: p.active_count,
    mrr: p.mrr_total,
    retention: p.retention_pct == null ? null : Number(p.retention_pct.toFixed(1)),
  }));

  const fmt = (v: number | null) => {
    if (v == null) return "—";
    if (mode === "mrr") return formatBRL(v);
    if (mode === "retention") return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    return v.toLocaleString("pt-BR");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Curva de cohort (M0 a M12)</CardTitle>
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
          {!data.length ? (
            <p className="text-sm text-muted-foreground">
              Sem histórico de snapshots suficiente para montar a curva. Importe a lista, informe a data de ativação e recalcule o cohort.
            </p>
          ) : (
            <>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey={mode}
                      name={MODE_LABEL[mode]}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-2 py-1.5 text-left">Mês</th>
                      {data.map((d) => <th key={d.label} className="px-2 py-1.5 text-right">{d.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="px-2 py-1.5 text-muted-foreground">Ativos</td>
                      {data.map((d) => <td key={d.label} className="px-2 py-1.5 text-right tabular-nums">{d.clients}</td>)}
                    </tr>
                    <tr className="border-b">
                      <td className="px-2 py-1.5 text-muted-foreground">MRR</td>
                      {data.map((d) => <td key={d.label} className="px-2 py-1.5 text-right tabular-nums">{formatBRL(d.mrr)}</td>)}
                    </tr>
                    <tr>
                      <td className="px-2 py-1.5 text-muted-foreground">Retenção</td>
                      {data.map((d) => (
                        <td key={d.label} className="px-2 py-1.5 text-right tabular-nums">
                          {d.retention == null ? "—" : `${d.retention.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
