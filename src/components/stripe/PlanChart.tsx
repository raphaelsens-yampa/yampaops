import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ChartStyle = "bar" | "pie";
export interface PlanPoint { plan: string; value: number; }
interface Labels { qty: boolean; pct: boolean; }

const DEFAULT_LABELS: Labels = { qty: true, pct: false };

function readStyle(key: string): ChartStyle {
  try {
    const v = localStorage.getItem(`${key}.style`);
    return v === "pie" || v === "bar" ? v : "bar";
  } catch { return "bar"; }
}
function readLabels(key: string): Labels {
  try {
    const raw = localStorage.getItem(`${key}.labels`);
    if (!raw) return DEFAULT_LABELS;
    const parsed = JSON.parse(raw) as Partial<Labels>;
    return { qty: parsed.qty ?? DEFAULT_LABELS.qty, pct: parsed.pct ?? DEFAULT_LABELS.pct };
  } catch { return DEFAULT_LABELS; }
}
const pctText = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1).replace(".", ",")}%` : "";

/** Gráfico de um plano: colunas ou pizza, com rótulos de valor e % opcionais. */
export function PlanChart({
  title, data, colorOf, formatValue, storageKey, yTickFormat,
}: {
  title: string;
  data: PlanPoint[];
  colorOf: (plan: string) => string;
  formatValue: (v: number) => string;
  storageKey: string;
  yTickFormat?: (v: number) => string;
}) {
  const [style, setStyle] = useState<ChartStyle>(() => readStyle(storageKey));
  const [labels, setLabels] = useState<Labels>(() => readLabels(storageKey));

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const hasSlices = data.length > 0 && total > 0;

  const persistStyle = (next: ChartStyle) => {
    setStyle(next);
    try { localStorage.setItem(`${storageKey}.style`, next); } catch { /* armazenamento indisponível */ }
  };
  const persistLabels = (next: Labels) => {
    setLabels(next);
    try { localStorage.setItem(`${storageKey}.labels`, JSON.stringify(next)); } catch { /* armazenamento indisponível */ }
  };

  const barLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!labels.qty && !labels.pct) return null;
    const lines = [
      labels.qty ? formatValue(Number(value)) : "",
      labels.pct ? pctText(Number(value), total) : "",
    ].filter(Boolean);
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
        {lines.map((line, i) => <tspan key={i} x={x + width / 2} dy={i === 0 ? 0 : 11}>{line}</tspan>)}
      </text>
    );
  };

  const pieLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, name, value, percent } = props;
    if (!labels.qty && !labels.pct) return null;
    const lines = [
      labels.qty ? formatValue(Number(value)) : "",
      labels.pct ? pctText(Number(value), total) : "",
    ].filter(Boolean);
    const rad = (Math.PI / 180) * midAngle;
    const x = cx + Math.cos(rad) * outerRadius * 1.18;
    const y = cy + Math.sin(rad) * outerRadius * 1.18;
    const anchor = midAngle > 90 && midAngle < 270 ? "end" : "start";
    return (
      <text x={x} y={y} textAnchor={anchor} className="fill-muted-foreground" fontSize={10}>
        <tspan x={x} dy={lines.length > 1 ? -6 : 4} className="fill-foreground">{name}</tspan>
        {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 11 : 10}>{line}</tspan>)}
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={labels.qty}
                onClick={() => persistLabels({ ...labels, qty: !labels.qty })}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${labels.qty ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Quantidade
              </button>
              <button
                type="button"
                aria-pressed={labels.pct}
                onClick={() => persistLabels({ ...labels, pct: !labels.pct })}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${labels.pct ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                %
              </button>
            </div>
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
            <BarChart data={data} margin={{ top: labels.qty || labels.pct ? 26 : 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="plan" tick={{ fontSize: 11 }} interval={0} angle={-30} height={70} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={yTickFormat} />
              <Tooltip formatter={(v: any) => formatValue(Number(v))} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((e) => <Cell key={e.plan} fill={colorOf(e.plan)} />)}
                {(labels.qty || labels.pct) && <LabelList dataKey="value" content={barLabel} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(v: any, name: any) => [
                `${formatValue(Number(v))}${labels.pct ? ` (${pctText(Number(v), total)})` : ""}`,
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
                labelLine={false}
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
