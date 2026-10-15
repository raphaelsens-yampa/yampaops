import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { LabelMode } from "@/components/stripe/PlanChart";

export interface AreaPoint { area: string; conversoes: number; mrr: number; }

const LABEL_MODES: LabelMode[] = ["qty", "mrr", "pct"];

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

/** Gráfico por Área (rosca ou colunas) com rótulos alternáveis: Quantidade, MRR ou %. */
export function AreaChart({
  title, data, colorOf, variant, storageKey, defaultLabel = "qty",
  formatQty, formatMrr, yTickFormat,
}: {
  title: string;
  data: AreaPoint[];
  colorOf: (area: string) => string;
  variant: "donut" | "bar";
  storageKey: string;
  defaultLabel?: LabelMode;
  formatQty?: (v: number) => string;
  formatMrr?: (v: number) => string;
  yTickFormat?: (v: number) => string;
}) {
  const [labels, setLabels] = useState<LabelMode>(() => readLabelMode(storageKey, defaultLabel));

  // % relativa à métrica base do gráfico (rosca = conversões; colunas = MRR).
  const baseTotal = useMemo(
    () => data.reduce((s, d) => s + (variant === "donut" ? d.conversoes : d.mrr), 0),
    [data, variant],
  );
  const hasSlices = data.length > 0 && baseTotal > 0;

  const persistLabels = (next: LabelMode) => {
    setLabels(next);
    try { localStorage.setItem(`${storageKey}.labels`, next); } catch { /* armazenamento indisponível */ }
  };

  const labelText = (entry: AreaPoint) => {
    if (labels === "qty") return (formatQty ?? String)(entry.conversoes);
    if (labels === "mrr") return (formatMrr ?? String)(entry.mrr);
    return pctText(variant === "donut" ? entry.conversoes : entry.mrr, baseTotal);
  };

  // LabelList/Pie nem sempre entregam o datum em `payload`; usar o índice na série.
  const entryOf = (props: any): AreaPoint | undefined => {
    const i = props?.index;
    if (typeof i === "number" && data[i]) return data[i];
    if (props?.payload) return props.payload as AreaPoint;
    return undefined;
  };

  const barLabel = (props: any) => {
    const { x, y, width } = props;
    const entry = entryOf(props);
    if (!entry) return null;
    const line = labelText(entry);
    if (!line) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
        {line}
      </text>
    );
  };

  const pieLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius } = props;
    const entry = entryOf(props);
    if (!entry) return null;
    const line = labelText(entry);
    const rad = (Math.PI / 180) * -midAngle;
    const x = cx + Math.cos(rad) * (outerRadius + 18);
    const y = cy + Math.sin(rad) * (outerRadius + 18);
    const anchor = midAngle > 90 && midAngle < 270 ? "end" : "start";
    return (
      <text x={x} y={y} textAnchor={anchor} className="fill-muted-foreground" fontSize={10}>
        {line}
      </text>
    );
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
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
      </CardHeader>
      <CardContent className="h-[280px]">
        {!hasSlices ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados no período ou filtro atual.
          </div>
        ) : variant === "donut" ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(_, __, item) => {
                const p = item?.payload as AreaPoint | undefined;
                const q = p ? `${p.conversoes} conversões` : "";
                const m = p ? ` · ${fmtOrFallback(formatMrr, p.mrr)}` : "";
                return `${q}${labels === "pct" ? "" : m}`;
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie
                data={data}
                dataKey="conversoes"
                nameKey="area"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={45}
                paddingAngle={2}
                label={pieLabel}
                labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                isAnimationActive={false}
              >
                {data.map((e) => <Cell key={e.area} fill={colorOf(e.area)} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 26, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="area" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={yTickFormat} />
              <Tooltip formatter={(v: any) => (variant === "bar" ? (formatMrr ?? String)(Number(v)) : `${Number(v)} conversões`)} />
              <Bar dataKey="mrr" radius={[6, 6, 0, 0]}>
                {data.map((e) => <Cell key={e.area} fill={colorOf(e.area)} />)}
                <LabelList dataKey="mrr" content={barLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function fmtOrFallback(fmt: ((v: number) => string) | undefined, v: number) {
  return fmt ? fmt(v) : String(v);
}
