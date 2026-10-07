import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DESFECHO_LABEL, groupStats, riskQueue, tenureBand, TIPO_LABEL, type ChurnCase, type GroupStat,
} from "@/lib/churnAnalysis";

const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(0)}%`);
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const monthsAgo = (n: number) => {
  const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
};

const DIMENSIONS: { key: string; label: string; fn: (r: ChurnCase) => string | null }[] = [
  { key: "motivo", label: "Motivo", fn: (r) => r.motivo },
  { key: "plano", label: "Plano", fn: (r) => r.plano },
  { key: "segmento", label: "Segmento", fn: (r) => r.segmento },
  { key: "ramo", label: "Ramo (Carteira)", fn: (r) => r.industry },
  { key: "tempo", label: "Tempo de casa", fn: (r) => tenureBand(r.tenure_days, r.inicio_vigencia, r.data_ref) },
  { key: "origem", label: "Origem", fn: (r) => r.origem_cliente },
  { key: "cs", label: "Analista de CS", fn: (r) => r.cs_name },
  { key: "engajamento", label: "Engajamento", fn: (r) => r.engagement_band },
  { key: "canal", label: "Canal de recuperação", fn: (r) => r.recovery_channel },
];

export default function ChurnAnalysis() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "tatico";
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthsAgo(5));
  const [to, setTo] = useState(todaySP());
  const [tipo, setTipo] = useState("all");
  const [include4blue, setInclude4blue] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const casesQ = useQuery({
    queryKey: ["churn-analysis", from, to],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<ChurnCase>(
        () => (supabase as any).rpc("churn_analysis_cases", { p_from: from, p_to: to }).order("data_ref").order("id"),
      );
      if (error) throw new Error(error);
      return data;
    },
  });
  const lastImport = useQuery({
    queryKey: ["pre-churn-last-import"],
    queryFn: async () => {
      const { data } = await supabase.from("metas_pre_churn").select("imported_at").order("imported_at", { ascending: false }).limit(1);
      return data?.[0]?.imported_at ?? null;
    },
  });
  const insightsQ = useQuery({
    queryKey: ["churn-ai-insights"],
    queryFn: async () => {
      const { data } = await supabase.from("churn_ai_insights").select("*").order("generated_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
  });

  const rows = useMemo(
    () => (casesQ.data || []).filter((r) =>
      (tipo === "all" || r.tipo === tipo) && (include4blue || (r.origem_cliente || "").toLowerCase() !== "4blue")),
    [casesQ.data, tipo, include4blue],
  );
  const today = todaySP();
  const total = groupStats(rows, () => "total")[0];
  const byTipo = groupStats(rows, (r) => TIPO_LABEL[r.tipo]);
  const queue = useMemo(() => riskQueue(rows, today), [rows, today]);
  const monthly = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of rows) {
      const k = r.data_ref.slice(0, 7);
      const o = m.get(k) || { mes: `${k.slice(5)}/${k.slice(2, 4)}`, k, Revertido: 0, Churn: 0, "Em risco": 0 };
      o[DESFECHO_LABEL[r.desfecho]] += 1;
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => a.k.localeCompare(b.k));
  }, [rows]);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("pre-churn-ingest", { body: {} });
    setSyncing(false);
    if (error || data?.error) return toast.error(data?.error || error?.message);
    toast.success(`Base de pré-churn atualizada: ${data.gravados} registros`);
    qc.invalidateQueries({ queryKey: ["churn-analysis"] });
    qc.invalidateQueries({ queryKey: ["pre-churn-last-import"] });
  };

  const generate = async () => {
    setGenerating(true);
    const stats = Object.fromEntries(
      DIMENSIONS.map((d) => [d.label, groupStats(rows, d.fn).slice(0, 15).map(({ key, total, mrr, revertidos, churn, emRisco, reversaoPct }) =>
        ({ key, total, mrr: Math.round(mrr), revertidos, churn, emRisco, reversaoPct: reversaoPct == null ? null : Math.round(reversaoPct) }))]),
    );
    stats["Por tipo"] = byTipo as any;
    stats["Evolução mensal"] = monthly as any;
    stats["Descrições de cancelamento (amostra)"] = rows.filter((r) => r.descricao).slice(-40).map((r) => r.descricao) as any;
    const clientes = queue.slice(0, 20).map((r) => ({
      email: r.email, tipo: r.tipo, motivo: r.motivo, plano: r.plano, mrr: r.mrr, dias_para_churn: r.dias,
      segmento: r.segmento, tempo_casa: tenureBand(r.tenure_days, r.inicio_vigencia, r.data_ref), descricao: r.descricao,
    }));
    const { data, error } = await supabase.functions.invoke("churn-ai-insights", { body: { period_from: from, period_to: to, stats, clientes } });
    setGenerating(false);
    if (error || data?.error) return toast.error(data?.error || "Não foi possível gerar as recomendações. Se os créditos de IA acabaram, adicione créditos no workspace.");
    toast.success("Recomendações geradas");
    qc.invalidateQueries({ queryKey: ["churn-ai-insights"] });
  };

  const ins = insightsQ.data?.insights as any;
  const aiByEmail = new Map<string, any>((ins?.clientes || []).map((c: any) => [String(c.email).toLowerCase(), c]));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold">Análise do Churn</h1>
            <p className="text-sm text-muted-foreground">
              Base oficial de pré-churn do Metabase cruzada com ativos, Carteira de CS e recuperações.
              {lastImport.data && ` Atualizada em ${new Date(lastImport.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label htmlFor="ca-from">De</Label><Input id="ca-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ca-to">Até</Label><Input id="ca-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="voluntario">Voluntário</SelectItem>
                  <SelectItem value="involuntario">Involuntário</SelectItem>
                  <SelectItem value="outro">Sem tipo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant={include4blue ? "default" : "outline"} onClick={() => setInclude4blue((v) => !v)}>
              {include4blue ? "Com 4blue" : "Sem 4blue"}
            </Button>
            {canEdit && <Button variant="outline" onClick={sync} disabled={syncing}><RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Atualizar base</Button>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Kpi title="Casos de pré-churn" value={String(total?.total ?? 0)} sub={brl(total?.mrr ?? 0) + " em MRR"} />
          <Kpi title="Em risco agora" value={String(total?.emRisco ?? 0)} sub={brl(queue.reduce((s, r) => s + r.mrr, 0))} />
          <Kpi title="Revertidos" value={String(total?.revertidos ?? 0)} sub={`Taxa de reversão ${pct(total?.reversaoPct ?? null)}`} />
          <Kpi title="Viraram churn" value={String(total?.churn ?? 0)} sub={brl(total?.mrrChurn ?? 0) + " perdidos"} />
        </div>

        <Tabs defaultValue="fila">
          <TabsList>
            <TabsTrigger value="fila">Fila de antecipação</TabsTrigger>
            <TabsTrigger value="padroes">Padrões</TabsTrigger>
            <TabsTrigger value="evolucao">Funil e evolução</TabsTrigger>
            <TabsTrigger value="ia">Ações com IA</TabsTrigger>
          </TabsList>

          <TabsContent value="fila">
            <Card>
              <CardHeader><CardTitle className="text-base">Clientes em pré-churn hoje ({queue.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead>Motivo</TableHead><TableHead>Plano</TableHead>
                    <TableHead className="text-right">MRR</TableHead><TableHead>Vira churn em</TableHead><TableHead>CS</TableHead><TableHead>Abordagem sugerida</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {casesQ.isLoading && <TableRow><TableCell colSpan={8}>Carregando…</TableCell></TableRow>}
                    {!casesQ.isLoading && queue.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nenhum cliente em risco no período.</TableCell></TableRow>}
                    {queue.map((r) => {
                      const ai = r.email ? aiByEmail.get(r.email) : null;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Link to="/atendimentos/carteira-cs" className="font-medium hover:underline">{r.email || r.company_id}</Link>
                            {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                          </TableCell>
                          <TableCell><Badge variant="outline">{r.tipo === "voluntario" ? "Voluntário" : r.tipo === "involuntario" ? "Involuntário" : "—"}</Badge></TableCell>
                          <TableCell className="max-w-48 text-sm">{r.motivo || "—"}{r.descricao && <div className="text-xs text-muted-foreground line-clamp-2">{r.descricao}</div>}</TableCell>
                          <TableCell>{r.plano || "—"}</TableCell>
                          <TableCell className="text-right">{brl(r.mrr)}</TableCell>
                          <TableCell>
                            <Badge className={r.dias != null && r.dias <= 3 ? "bg-destructive/15 text-destructive" : r.dias != null && r.dias <= 7 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}>
                              {r.dias == null ? "—" : r.dias <= 0 ? "hoje" : `${r.dias} dias`}
                            </Badge>
                            <div className="text-xs text-muted-foreground">{fmtDate(r.future_churn_at || r.final_vigencia)}</div>
                          </TableCell>
                          <TableCell>{r.cs_name || "—"}</TableCell>
                          <TableCell className="max-w-72 text-xs">{ai ? <><b>{ai.risco}</b><div>{ai.abordagem}</div></> : <span className="text-muted-foreground">Gere as ações com IA</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="padroes" className="grid gap-4 lg:grid-cols-2">
            {DIMENSIONS.map((d) => <StatTable key={d.key} title={d.label} stats={groupStats(rows, d.fn).slice(0, 12)} />)}
          </TabsContent>

          <TabsContent value="evolucao" className="space-y-4">
            <StatTable title="Funil por tipo: pré-churn → revertido / churn" stats={byTipo} />
            <Card>
              <CardHeader><CardTitle className="text-base">Desfecho por mês do pré-churn</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" /><YAxis /><Tooltip /><Legend />
                    <Bar dataKey="Revertido" stackId="a" fill="hsl(var(--success))" />
                    <Bar dataKey="Em risco" stackId="a" fill="hsl(var(--warning))" />
                    <Bar dataKey="Churn" stackId="a" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ia" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {insightsQ.data ? `Última análise: ${new Date(insightsQ.data.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (${fmtDate(insightsQ.data.period_from)} a ${fmtDate(insightsQ.data.period_to)})` : "Nenhuma análise gerada ainda."}
              </p>
              {canEdit && <Button onClick={generate} disabled={generating || !rows.length}><Sparkles className="mr-2 h-4 w-4" />{generating ? "Analisando…" : "Gerar ações com IA"}</Button>}
            </div>
            {ins && (
              <>
                <Card><CardHeader><CardTitle className="text-base">Diagnóstico</CardTitle></CardHeader><CardContent className="text-sm">{ins.resumo}</CardContent></Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Padrões identificados</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {(ins.padroes || []).map((p: any, i: number) => (
                      <div key={i} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center gap-2 font-medium">{p.titulo}<Badge variant="outline">impacto {p.impacto}</Badge></div>
                        <div className="text-muted-foreground">{p.evidencia}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Ações recomendadas para o CS</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {(ins.acoes || []).map((a: any, i: number) => (
                      <div key={i} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex items-center gap-2 font-medium">{a.acao}<Badge className={a.prioridade === "alta" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}>{a.prioridade}</Badge></div>
                        <div className="text-xs text-muted-foreground">Público: {a.publico}</div>
                        <div className="italic">"{a.argumento}"</div>
                        {a.oferta && <div className="text-xs">Oferta: {a.oferta}</div>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function Kpi({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs uppercase text-muted-foreground">{title}</div>
      <div className="font-heading text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </CardContent></Card>
  );
}

function StatTable({ title, stats }: { title: string; stats: GroupStat[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead /><TableHead className="text-right">Casos</TableHead><TableHead className="text-right">MRR</TableHead>
            <TableHead className="text-right">Revertidos</TableHead><TableHead className="text-right">Churn</TableHead><TableHead className="text-right">Reversão</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {stats.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="max-w-56 truncate" title={g.key}>{g.key}</TableCell>
                <TableCell className="text-right">{g.total}</TableCell>
                <TableCell className="text-right">{brl(g.mrr)}</TableCell>
                <TableCell className="text-right">{g.revertidos}</TableCell>
                <TableCell className="text-right">{g.churn}</TableCell>
                <TableCell className="text-right">{pct(g.reversaoPct)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
