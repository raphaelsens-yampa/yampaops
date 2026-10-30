import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { ORIGIN_OPTIONS, type OriginFilter } from "@/lib/origins";
import { computeProjectedResult } from "./projectedResultModel";
import { useProjectedResult } from "./useProjectedResult";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR");
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

export function ProjectedResult() {
  const { data, loading, error } = useProjectedResult();
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const r = useMemo(() => (data ? computeProjectedResult(data.base, data.ops, data.churn, origin) : null), [data, origin]);

  if (loading && !data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error && !data) return <p className="text-sm text-destructive">Não foi possível carregar: {error}</p>;
  if (!data || !r) return null;

  const bridge: [string, number, boolean][] = [
    [`Base oficial (${br(data.snapshot)})`, r.baseMrr, false],
    [`+ Novas vendas (${r.vendasQtd})`, r.vendasMrr, true],
    [`+ Recuperados (${r.recuperadosQtd})`, r.recuperadosMrr, true],
    ["+ Upsell", r.upsellMrr, true],
    ["− Downsell", -r.downsellMrr, true],
    [`− Churn previsto (${r.churnQtd})`, -r.churnMrr, true],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-semibold">Resultado projetado para {br(data.tomorrow)}</h2>
          <p className="text-sm text-muted-foreground">Operações confirmadas desde {br(data.snapshot)} até hoje e churn previsto até amanhã.</p>
        </div>
        <Select value={origin} onValueChange={(v) => setOrigin(v as OriginFilter)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{ORIGIN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">MRR Total projetado</p>
          <p className="text-3xl font-heading font-bold">{brl(r.projectedMrr)}</p>
          <p className="text-sm text-muted-foreground">Atual {brl(r.baseMrr)} · <span className={r.projectedMrr >= r.baseMrr ? "text-primary" : "text-destructive"}>{signed(r.projectedMrr - r.baseMrr, brl)}</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Usuários projetados</p>
          <p className="text-3xl font-heading font-bold">{num(r.projectedUsers)}</p>
          <p className="text-sm text-muted-foreground">Atual {num(r.baseUsers)} · <span className={r.projectedUsers >= r.baseUsers ? "text-primary" : "text-destructive"}>{signed(r.projectedUsers - r.baseUsers, num)}</span></p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Da base atual ao projetado</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {bridge.map(([label, v, delta]) => (
            <div key={label} className="flex justify-between border-b border-border/50 pb-1">
              <span>{label}</span><span className="font-medium tabular-nums">{delta ? signed(v, brl) : brl(v)}</span>
            </div>
          ))}
          <div className="flex justify-between text-muted-foreground"><span>Churn evitado ({r.avoidedQtd}, não descontado)</span><span className="tabular-nums">{brl(r.avoidedMrr)}</span></div>
          <div className="flex justify-between pt-1 font-semibold"><span>MRR projetado</span><span className="tabular-nums">{brl(r.projectedMrr)}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Churn previsto até {br(data.tomorrow)}</CardTitle></CardHeader>
        <CardContent>
          {r.churnCases.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum churn previsto.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">MRR</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.churnCases.map((c) => (
                  <TableRow key={c.email}>
                    <TableCell className="font-medium">{c.email}</TableCell>
                    <TableCell>{br(c.date)}</TableCell>
                    <TableCell className="capitalize">{c.tipo}</TableCell>
                    <TableCell>{c.origin === "4blue" ? "4blue" : "Yampa"}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(c.mrr)}</TableCell>
                    <TableCell>{c.avoided ? <Badge variant="secondary">{c.avoidedBy}</Badge> : <Badge variant="destructive">Churn</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
