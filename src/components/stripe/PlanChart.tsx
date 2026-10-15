import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ChartStyle = "bar" | "pie";
/** Métrica exibida nos rótulos: quantidade, MRR ou % do total do gráfico. */
export type LabelMode = "qty" | "mrr" | "pct";
export interface PlanPoint {
  plan: string;
  value: number;
  /** MRR do plano, quando o gráfico é de quantidade. */
  mrr?: number;
  /** Quantidade de conversões, quando o gráfico é de MRR. */
  conversoes?: number;
}

const LABEL_MODES: LabelMode[] = ["qty", "mrr", "pct"];

function readStyle(key: string): ChartStyle {
  try {
    const v = localStorage.getItem(`${key}.style`);
    return v === "pie" || v === "bar" ? v : "bar";
  } catch { return "bar"; }
}
function readLabelMode(key: string, fallback: LabelMode): LabelMode {
  try {
    const raw = localStorage.getItem(`${key}.labels`);
    if (!raw) return fallback;
    // Legado: objeto { qty, pct } das versões anteriores.
    if (raw.trim().startsWith("{")) {
      const parsed = JSON.parse(raw) as { qty?: boolean; pct?: boolean };
      if (parsed.pct) return "pct";
      if (parsed.qty) return "qty";
      return fallback;
    }
    return (LABEL_MODES as string[]).includes(raw) ? (raw as LabelMode) : fallback;
  } catch { return fallback; }
}
const pctText = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1).replace(".", ",")}%` : "";

/** Gráfico de um plano: colunas ou pizza, com rótulos de Quantidade, MRR ou %. */
export function PlanChart({
  title, data, colorOf, formatValue, formatQty, formatMrr, defaultLabel = "qty",
  storageKey, yTickFormat,
}: {
  title: string;
  data: PlanPoint[];
  colorOf: (plan: string) => string;
  formatValue: (v: number) => string;
  formatQty?: (v: number) => string;
  formatMrr?: (v: number) => string;
  defaultLabel?: LabelMode;
  storageKey: string;
  yTickFormat?: (v: number) => string;
}) {
  const [style, setStyle] = useState<ChartStyle>(() => readStyle(storageKey));
  const [labels, setLabels] = useState<LabelMode>(() => readLabelMode(storageKey, defaultLabel));

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const hasSlices = data.length > 0 && total > 0;

  const persistStyle = (next: ChartStyle) => {
    setStyle(next);
    try { localStorage.setItem(`${storageKey}.style`, next); } catch { /* armazenamento indisponível */ }
  };
  const persistLabels = (next: LabelMode) => {
    setLabels(next);
    try { localStorage.setItem(`${storageKey}.labels`, next); } catch { /* armazenamento indisponível */ }
  };

  const labelText = (entry: PlanPoint) => {
    if (labels === "qty") return (formatQty ?? String)(entry.conversoes ?? entry.value);
    if (labels === "mrr") return (formatMrr ?? formatValue)(entry.mrr ?? entry.value);
    return pctText(entry.value, total);
  };

  const barLabel = (props: any) => {
    const { x, y, width, payload } = props;
    const line = labelText(payload as PlanPoint);
    if (!line) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
        {line}
      </text>
    );
  };

  const pieLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, name, payload } = props;
    const line = labelText(payload as PlanPoint);
    const rad = (Math.PI / 180) * -midAngle;
    const x = cx + Math.cos(rad) * (outerRadius + 18);
    const y = cy + Math.sin(rad) * (outerRadius + 18);
    const anchor = midAngle > 90 && midAngle < 270 ? "end" : "start";
    return (
      <text x={x} y={y} textAnchor={anchor} className="fill-muted-foreground" fontSize={10}>
        <tspan x={x} dy={line ? -6 : 4} className="fill-foreground">{String(name)}</tspan>
        {line && <tspan x={x} dy={11} className="fill-muted-foreground">{line}</tspan>}
      </text>
    );
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              value={style}
              onValueChange={(v: ChartStyle) => v && persistStyle(v)}
              className="rounded-md border border-border"
            >
              <ToggleGroupItem value="bar" className="text-xs">Colunas</ToggleGroupItem>
              <ToggleGroupItem value="pie" className="text-xs">Pizza</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              type="single"
              size="sm"
              value={labels}
              onValueChange={(v: string) => v && persistLabels(v as LabelMode)}
              className="rounded-md border border-border"
            >
              <ToggleGroupItem value="qty" className="text-xs">Quantidade</ToggleGroupItem>
              <ToggleGroupItem value="mrr" className="text-xs">MRR</ToggleGroupItem>
              <ToggleGroupItem value="pct" className="text-xs">%</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[320px]">
        {!hasSlices ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados no período ou filtro atual.
          </div>
        ) : style === "bar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 26, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="plan" tick={{ fontSize: 11 }} interval={0} angle={-30} height={70} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={yTickFormat} />
              <Tooltip formatter={(v: any) => formatValue(Number(v))} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((e) => <Cell key={e.plan} fill={colorOf(e.plan)} />)}
                <LabelList dataKey="value" content={barLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(v: any, name: any) => [
                `${formatValue(Number(v))}${labels === "pct" ? ` (${pctText(Number(v), total)})` : ""}`,
                String(name),
              ]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="plan"
                cx="50%"
                cy="45%"
                outerRadius="72%"
                paddingAngle={2}
                label={pieLabel}
                labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                isAnimationActive={false}
              >
                {data.map((e) => <Cell key={e.plan} fill={colorOf(e.plan)} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
