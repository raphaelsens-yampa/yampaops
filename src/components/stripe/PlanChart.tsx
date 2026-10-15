import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ChartStyle = "bar" | "pie";
/** Métrica exibida nos rótulos: quantidade, MRR, % do total ou ambos (valor fora + % dentro). */
export type LabelMode = "qty" | "mrr" | "pct" | "both";
export interface PlanPoint {
  plan: string;
  value: number;
  /** MRR do plano, quando o gráfico é de quantidade. */
  mrr?: number;
  /** Quantidade de conversões, quando o gráfico é de MRR. */
  conversoes?: number;
}

const LABEL_MODES: LabelMode[] = ["qty", "mrr", "pct", "both"];

function readStyle(key: string): ChartStyle {
  try {
    const v = localStorage.getItem(`${key}.style`);
    return v === "pie" || v === "bar" ? v : "bar";
  } catch { return "bar"; }
}
function readLabelMode(key: string, fallback: LabelMode, allowed?: LabelMode[]): LabelMode {
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
    const mode = (LABEL_MODES as string[]).includes(raw) ? (raw as LabelMode) : fallback;
    if (allowed && !allowed.includes(mode)) return fallback;
    return mode;
  } catch { return fallback; }
}
const pctText = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1).replace(".", ",")}%` : "";

const MODE_LABEL: Record<LabelMode, string> = {
  qty: "Quantidade",
  mrr: "MRR",
  pct: "%",
  both: "Ambos",
};

/** Gráfico de um plano: colunas ou pizza; rótulos alternáveis conforme `labelOptions`. */
export function PlanChart({
  title, data, colorOf, formatValue, formatQty, formatMrr, defaultLabel = "qty",
  storageKey, yTickFormat, labelOptions,
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
  /** Métricas oferecidas no seletor de rótulos; ausente/vazio = sem seletor. */
  labelOptions?: LabelMode[];
}) {
  const [style, setStyle] = useState<ChartStyle>(() => readStyle(storageKey));
  const [labels, setLabels] = useState<LabelMode>(() => readLabelMode(storageKey, defaultLabel, labelOptions));

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

  /** Valor externo: no modo "both" usa a métrica principal do gráfico (qty ou mrr). */
  const valueText = (entry: PlanPoint) => {
    const mode = labels === "both" ? defaultLabel : labels;
    if (mode === "qty") return (formatQty ?? String)(entry.conversoes ?? entry.value);
    if (mode === "mrr") return (formatMrr ?? formatValue)(entry.mrr ?? entry.value);
    return pctText(entry.value, total);
  };

  // LabelList/Pie nem sempre entregam o datum em `payload`; usar o índice na série.
  const entryOf = (props: any): PlanPoint | undefined => {
    const i = props?.index;
    if (typeof i === "number" && data[i]) return data[i];
    if (props?.payload) return props.payload as PlanPoint;
    return undefined;
  };

  const barLabelOutside = (props: any) => {
    const { x, y, width } = props;
    const entry = entryOf(props);
    if (!entry) return null;
    const line = valueText(entry);
    if (!line) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
        {line}
      </text>
    );
  };

  const barLabelInside = (props: any) => {
    const { x, y, width, height } = props;
    const entry = entryOf(props);
    if (!entry) return null;
    const line = pctText(entry.value, total);
    if (!line || height < 18) return null;
    return (
      <text x={x + width / 2} y={y + height / 2 + 3} textAnchor="middle" className="fill-background" fontSize={10}>
        {line}
      </text>
    );
  };

  const pieLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, name } = props;
    const entry = entryOf(props);
    if (!entry) return null;
    const line = valueText(entry);
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

  const pieLabelInside = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius } = props;
    const entry = entryOf(props);
    if (!entry) return null;
    const pct = entry.value / total;
    if (pct < 0.05) return null; // fatia pequena demais para rótulo interno
    const rad = (Math.PI / 180) * -midAngle;
    const r = (innerRadius + outerRadius) / 2;
    const x = cx + Math.cos(rad) * r;
    const y = cy + Math.sin(rad) * r;
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-background" fontSize={10}>
        {pctText(entry.value, total)}
      </text>
    );
  };

  const both = labels === "both";

  return (
    <Card>
      <CardHeader className="gap-0 py-4">
        <div className="flex flex-nowrap items-center justify-between gap-3">
          <CardTitle className="min-w-0 truncate text-base">{title}</CardTitle>
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              value={style}
              onValueChange={(v: ChartStyle) => v && persistStyle(v)}
              className="rounded-md border border-border"
            >
              <ToggleGroupItem value="bar" className="px-2.5 text-xs">Colunas</ToggleGroupItem>
              <ToggleGroupItem value="pie" className="px-2.5 text-xs">Pizza</ToggleGroupItem>
            </ToggleGroup>
            {labelOptions && labelOptions.length > 0 && (
              <ToggleGroup
                type="single"
                size="sm"
                value={labels}
                onValueChange={(v: string) => v && persistLabels(v as LabelMode)}
                className="rounded-md border border-border"
              >
                {labelOptions.map((m) => (
                  <ToggleGroupItem key={m} value={m} className="px-2.5 text-xs">
                    {MODE_LABEL[m]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
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
              <Tooltip formatter={(v: any) => `${formatValue(Number(v))} (${pctText(Number(v), total)})`} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((e) => <Cell key={e.plan} fill={colorOf(e.plan)} />)}
                <LabelList dataKey="value" content={barLabelOutside} />
                {both && <LabelList dataKey="value" content={barLabelInside} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(v: any, name: any) => [
                `${formatValue(Number(v))} (${pctText(Number(v), total)})`,
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
                {both && <LabelList dataKey="value" content={pieLabelInside} />}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
