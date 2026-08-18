import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ArrowDown, ArrowUp } from "lucide-react";
import { toBRDateKey } from "./types";
import { CHANNEL_LABEL, RecoveryChannel, RecoveryReason } from "./recoveryChannels";
import {
  ChannelValue,
  RecoveryChannelRow,
  channelDailySeries,
  rankReasons,
  summarizeChannels,
} from "./useRecoveryChannelData";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function dateKeysBetween(from: Date, to: Date) {
  const out: string[] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (d <= to) {
    out.push(toBRDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function RecoveryChannelPanel({
  rows,
  reasons,
  today,
  teamName,
}: {
  rows: RecoveryChannelRow[];
  reasons: RecoveryReason[];
  today: Date;
  teamName: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [preset, setPreset] = useState<"7" | "30" | "month">("month");
  const [measure, setMeasure] = useState<"qty" | "mrr">("mrr");
  const [channelTab, setChannelTab] = useState<"all" | RecoveryChannel>("all");

  const { fromDate, dates, prevFrom, prevTo } = useMemo(() => {
    const end = new Date(today);
    end.setHours(0, 0, 0, 0);
    let start: Date;
    if (preset === "month") start = new Date(end.getFullYear(), end.getMonth(), 1);
    else {
      start = new Date(end);
      start.setDate(start.getDate() - (Number(preset) - 1));
    }
    const span = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const pTo = new Date(start);
    pTo.setDate(pTo.getDate() - 1);
    const pFrom = new Date(pTo);
    pFrom.setDate(pFrom.getDate() - (span - 1));
    return { fromDate: start, dates: dateKeysBetween(start, end), prevFrom: toBRDateKey(pFrom), prevTo: toBRDateKey(pTo) };
  }, [today, preset]);

  const fromKey = dates[0] ?? toBRDateKey(today);
  const toKey = dates[dates.length - 1] ?? toBRDateKey(today);

  const periodRows = useMemo(
    () => rows.filter((r) => r.dateKey >= fromKey && r.dateKey <= toKey),
    [rows, fromKey, toKey],
  );
  const prevRows = useMemo(
    () => rows.filter((r) => r.dateKey >= prevFrom && r.dateKey <= prevTo),
    [rows, prevFrom, prevTo],
  );

  const scoped = useMemo(
    () => (channelTab === "all" ? periodRows : periodRows.filter((r) => r.channel === channelTab)),
    [periodRows, channelTab],
  );
  const prevScoped = useMemo(
    () => (channelTab === "all" ? prevRows : prevRows.filter((r) => r.channel === channelTab)),
    [prevRows, channelTab],
  );

  const summary = useMemo(() => summarizeChannels(periodRows), [periodRows]);
  const series = useMemo(() => channelDailySeries(periodRows, dates, measure), [periodRows, dates, measure]);
  const ranking = useMemo(() => rankReasons(scoped, reasons), [scoped, reasons]);
  const prevRanking = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rankReasons(prevScoped, reasons)) map.set(r.name, r.mrr);
    return map;
  }, [prevScoped, reasons]);

  const totalMrr = scoped.reduce((s, r) => s + r.mrr, 0);
  const fmtValue = (v: number) => (measure === "mrr" ? fmtBRL(v) : String(Math.round(v)));

  const channelCards: { key: ChannelValue; label: string; hint: string }[] = [
    { key: "cobranca", label: CHANNEL_LABEL.cobranca, hint: "retentativa / cobrança forçada" },
    { key: "cs", label: CHANNEL_LABEL.cs, hint: "ação humana do time" },
    { key: null, label: "Não classificado", hint: "sem canal declarado" },
  ];

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="px-4 md:px-6 flex flex-col items-stretch gap-3 space-y-0 md:flex-row md:items-center md:justify-between">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-start gap-2 text-left">
              <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">
                  Por que voltaram a pagar{teamName ? ` · ${teamName}` : ""}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Recuperações e retenções por canal (Cobrança x CS) e motivo declarado.
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
            <Select value={preset} onValueChange={(v) => setPreset(v as typeof preset)}>
              <SelectTrigger className="h-10 md:h-8 md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={measure} onValueChange={(v) => setMeasure(v as typeof measure)}>
              <SelectTrigger className="h-10 md:h-8 md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mrr">MRR</SelectItem>
                <SelectItem value="qty">Quantidade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 sm:px-4 md:px-6 space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {channelCards.map((c) => {
                const t =
                  c.key === "cobranca" ? summary.cobranca : c.key === "cs" ? summary.cs : summary.unclassified;
                if (c.key === null && t.qty === 0) return null;
                const share = summary.total.mrr > 0 ? (t.mrr / summary.total.mrr) * 100 : 0;
                const top = rankReasons(
                  periodRows.filter((r) => r.channel === c.key),
                  reasons,
                )[0];
                return (
                  <div key={String(c.key)} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">
                        {c.label}
                        <span className="text-muted-foreground font-normal"> · {c.hint}</span>
                      </p>
                      <Badge variant="outline" className="text-[10px]">{share.toFixed(0)}%</Badge>
                    </div>
                    <p className="text-lg font-heading font-bold mt-1">{fmtBRL(t.mrr)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.qty} clientes · {t.recovered} recuperados · {t.retained} retidos
                    </p>
                    {top && (
                      <p className="text-[11px] text-muted-foreground truncate">Motivo líder: {top.name}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={measure === "mrr" ? 60 : 32} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtValue(Number(v)), name]}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="cobranca" stackId="ch" name={CHANNEL_LABEL.cobranca} fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="cs" stackId="ch" name={CHANNEL_LABEL.cs} fill="hsl(var(--warning))" />
                  <Bar dataKey="unclassified" stackId="ch" name="Não classificado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "cobranca", "cs"] as const).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={channelTab === c ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setChannelTab(c)}
                >
                  {c === "all" ? "Todos os canais" : CHANNEL_LABEL[c]}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground">
                {scoped.length} registros · {fmtBRL(totalMrr)} de MRR
              </span>
            </div>

            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum registro de recuperação/retenção no período.
              </p>
            ) : (
              <div className="rounded-lg border divide-y">
                {ranking.map((r) => {
                  const share = totalMrr > 0 ? (r.mrr / totalMrr) * 100 : 0;
                  const prev = prevRanking.get(r.name) ?? 0;
                  const delta = r.mrr - prev;
                  return (
                    <div key={r.name} className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{r.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold">{fmtBRL(r.mrr)}</span>
                          {prev > 0 || delta !== 0 ? (
                            <span
                              className={`text-[11px] flex items-center gap-0.5 ${
                                delta >= 0 ? "text-success" : "text-destructive"
                              }`}
                            >
                              {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {fmtBRL(Math.abs(delta))}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(share, 100)}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {r.qty} clientes · {r.recovered} recuperados · {r.retained} retidos · {share.toFixed(0)}% do MRR
                      </p>
                    </div>
                  );
                })}
                <p className="p-2 text-[11px] text-muted-foreground">
                  Variação comparada ao período anterior de mesmo tamanho ({prevFrom.slice(8, 10)}/{prevFrom.slice(5, 7)} a{" "}
                  {prevTo.slice(8, 10)}/{prevTo.slice(5, 7)}).
                </p>
              </div>
            )}

            {summary.missingReason > 0 && (
              <p className="text-xs text-amber-600">
                {summary.missingReason} registro(s) do período sem motivo declarado — classifique na tabela
                “Clientes recuperados e retidos” para o ranking ficar confiável.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
