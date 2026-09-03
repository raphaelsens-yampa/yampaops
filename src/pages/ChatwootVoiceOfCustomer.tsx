import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";
import { toast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Loader2, RefreshCw, Sparkles, ExternalLink, X, MessageSquareQuote, Trash2 } from "lucide-react";

type ThemeRow = {
  conversation_id: number;
  day_sp: string | null;
  inbox_name: string | null;
  assignee_name: string | null;
  primary_theme: string | null;
  primary_theme_canonical: string | null;
  main_pain: string | null;
  sentiment: string | null;
  urgency: string | null;
  summary: string | null;
  client_message_count: number;
  themes: any;
  keywords: string[] | null;
};

const SP_TZ = "America/Sao_Paulo";
const spToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: SP_TZ }).format(new Date());
const addDays = (iso: string, n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SP_TZ }).format(new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400_000));
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400_000) + 1;
const fmtBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const SENT_LABEL: Record<string, string> = { positivo: "Positivo", neutro: "Neutro", negativo: "Negativo" };
const URG_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

export default function ChatwootVoiceOfCustomer() {
  const qc = useQueryClient();
  const { buildConversationUrl } = useChatwootIntegration();

  const today = spToday();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [inbox, setInbox] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [search, setSearch] = useState("");
  const [termFilter, setTermFilter] = useState<string | null>(null);
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const spanDays = Math.max(1, daysBetween(from, to));
  const prevFrom = addDays(from, -spanDays);
  const prevTo = addDays(from, -1);

  const loadThemes = async (a: string, b: string) => {
    const { data, error } = await fetchAllPaged<ThemeRow>(() =>
      supabase
        .from("chatwoot_conversation_themes")
        .select("conversation_id, day_sp, inbox_name, assignee_name, primary_theme, primary_theme_canonical, main_pain, sentiment, urgency, summary, client_message_count, themes, keywords")
        .gte("day_sp", a)
        .lte("day_sp", b)
        .order("day_sp", { ascending: false }) as any,
    );
    if (error) throw new Error(error);
    return data;
  };

  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: ["voc-themes", from, to],
    queryFn: () => loadThemes(from, to),
    staleTime: 2 * 60 * 1000,
  });

  const { data: prevRows = [] } = useQuery({
    queryKey: ["voc-themes-prev", prevFrom, prevTo],
    queryFn: () => loadThemes(prevFrom, prevTo),
    staleTime: 2 * 60 * 1000,
  });

  const { data: words = [], isLoading: loadingWords } = useQuery({
    queryKey: ["voc-words", from, to, inbox],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("chatwoot_client_word_counts", {
        p_from: from,
        p_to: to,
        p_limit: 120,
        p_inbox: inbox === "all" ? null : inbox,
      });
      if (error) throw error;
      return (data || []) as { term: string; occurrences: number; conversations: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["voc-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatwoot_voice_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["voc-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatwoot_theme_catalog")
        .select("*")
        .order("canonical_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const activeRun = runs.find((r: any) => r.status === "running");
  const pausedRun = runs.find((r: any) => r.status === "paused");

  const inboxes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.inbox_name).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const hiddenThemes = useMemo(
    () => new Set(catalog.filter((c: any) => !c.is_active).map((c: any) => String(c.canonical_name))),
    [catalog],
  );

  const themeOf = (r: ThemeRow) => (r.primary_theme_canonical || r.primary_theme || "sem tema").toLowerCase();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (inbox !== "all" && r.inbox_name !== inbox) return false;
      if (sentiment !== "all" && r.sentiment !== sentiment) return false;
      if (hiddenThemes.has(themeOf(r))) return false;
      const hay = [
        themeOf(r), r.main_pain, r.summary, (r.keywords || []).join(" "),
        JSON.stringify(r.themes || []),
      ].join(" ").toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (termFilter && !hay.includes(termFilter.toLowerCase())) return false;
      return true;
    });
  }, [rows, inbox, sentiment, search, termFilter, hiddenThemes]);

  const prevFilteredCount = useMemo(() => {
    return prevRows.filter((r) => {
      if (inbox !== "all" && r.inbox_name !== inbox) return false;
      if (sentiment !== "all" && r.sentiment !== sentiment) return false;
      if (hiddenThemes.has(themeOf(r))) return false;
      return true;
    });
  }, [prevRows, inbox, sentiment, hiddenThemes]);

  const ranking = useMemo(() => {
    const cur = new Map<string, { n: number; neg: number; alta: number; pains: string[] }>();
    for (const r of filtered) {
      const k = themeOf(r);
      const v = cur.get(k) || { n: 0, neg: 0, alta: 0, pains: [] };
      v.n++;
      if (r.sentiment === "negativo") v.neg++;
      if (r.urgency === "alta") v.alta++;
      if (r.main_pain && v.pains.length < 3) v.pains.push(r.main_pain);
      cur.set(k, v);
    }
    const prev = new Map<string, number>();
    for (const r of prevFilteredCount) {
      const k = themeOf(r);
      prev.set(k, (prev.get(k) || 0) + 1);
    }
    const totalCur = filtered.length || 1;
    const totalPrev = prevFilteredCount.length || 1;
    return Array.from(cur.entries())
      .map(([theme, v]) => {
        const share = (v.n / totalCur) * 100;
        const prevShare = ((prev.get(theme) || 0) / totalPrev) * 100;
        return {
          theme,
          count: v.n,
          share,
          deltaPp: prevFilteredCount.length ? share - prevShare : null,
          prevCount: prev.get(theme) || 0,
          negPct: (v.neg / v.n) * 100,
          altaPct: (v.alta / v.n) * 100,
          pains: v.pains,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [filtered, prevFilteredCount]);

  const topThemes = ranking.slice(0, 6).map((r) => r.theme);
  const series = selectedSeries.length ? selectedSeries : topThemes.slice(0, 4);

  const evolution = useMemo(() => {
    const byWeek = new Map<string, Record<string, number>>();
    for (const r of filtered) {
      if (!r.day_sp) continue;
      const d = new Date(`${r.day_sp}T12:00:00Z`);
      const dow = d.getUTCDay();
      const monday = new Date(d.getTime() - ((dow + 6) % 7) * 86400_000);
      const key = monday.toISOString().slice(0, 10);
      const k = themeOf(r);
      if (!byWeek.has(key)) byWeek.set(key, {});
      const bucket = byWeek.get(key)!;
      bucket[k] = (bucket[k] || 0) + 1;
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => {
        const row: any = { week: fmtBR(week).slice(0, 5) };
        for (const s of series) row[s] = v[s] || 0;
        return row;
      });
  }, [filtered, series]);

  const kpis = useMemo(() => {
    const msgs = filtered.reduce((s, r) => s + (r.client_message_count || 0), 0);
    const neg = filtered.filter((r) => r.sentiment === "negativo").length;
    const rising = ranking
      .filter((r) => r.deltaPp != null)
      .sort((a, b) => (b.deltaPp || 0) - (a.deltaPp || 0))[0];
    return { convs: filtered.length, msgs, themes: ranking.length, neg, rising };
  }, [filtered, ranking]);

  const drill = useMemo(
    () => (openTheme ? filtered.filter((r) => themeOf(r) === openTheme) : []),
    [openTheme, filtered],
  );

  const maxWordConvs = Math.max(1, ...words.map((w) => Number(w.conversations)));

  const runExtract = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatwoot-voice-extract", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.busy) toast({ title: "Já existe uma extração em andamento" });
      else if ((data as any)?.paused) toast({ title: "Job pausado", description: (data as any).reason, variant: "destructive" });
      else if ((data as any)?.nothing_to_do) toast({ title: "Nada novo para analisar no período" });
      else toast({ title: "Extração iniciada", description: `${(data as any)?.total || 0} conversas na fila` });
      qc.invalidateQueries({ queryKey: ["voc-runs"] });
    } catch (e: any) {
      toast({ title: "Erro ao iniciar extração", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const consolidate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatwoot-voice-consolidate", { body: { days: 120 } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Temas consolidados", description: `${(data as any)?.groups || 0} temas canônicos` });
      qc.invalidateQueries({ queryKey: ["voc-catalog"] });
      qc.invalidateQueries({ queryKey: ["voc-themes"] });
    } catch (e: any) {
      toast({ title: "Erro ao consolidar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelRun = async (id: string) => {
    await supabase.from("chatwoot_voice_runs").update({ cancel_requested: true }).eq("id", id);
    toast({ title: "Cancelamento solicitado" });
    qc.invalidateQueries({ queryKey: ["voc-runs"] });
  };

  const updateCatalog = async (id: string, patch: { canonical_name?: string; is_active?: boolean; description?: string }) => {
    const { error } = await supabase.from("chatwoot_theme_catalog").update(patch).eq("id", id);
    if (error) toast({ title: "Erro ao salvar tema", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["voc-catalog"] });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquareQuote className="h-6 w-6 text-primary" /> Voz do Cliente
            </h1>
            <p className="text-sm text-muted-foreground">
              Temas e dores extraídos apenas das mensagens recebidas dos clientes nos atendimentos.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
            </div>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["voc-themes"] })} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button onClick={() => runExtract({ kind: "manual", since: from, until: to, triggered_by: "manual_ui" })} disabled={busy || !!activeRun}>
              <Sparkles className="h-4 w-4 mr-2" /> Analisar período
            </Button>
          </div>
        </div>

        {pausedRun && (
          <Alert variant="destructive">
            <AlertTitle>Extração pausada</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {pausedRun.paused_reason || "Motivo não informado."}
              <Button size="sm" variant="outline" onClick={() => runExtract({ kind: "manual", since: from, until: to, resume: true })}>
                Retomar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {activeRun && (
          <Card>
            <CardContent className="pt-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Analisando {fmtBR(activeRun.period_start)} → {fmtBR(activeRun.period_end)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {activeRun.processed}/{activeRun.total_conversations} conversas
                    {activeRun.failed > 0 ? ` · ${activeRun.failed} falhas` : ""}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => cancelRun(activeRun.id)}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                </div>
              </div>
              <Progress value={Math.min(100, (activeRun.processed / Math.max(1, activeRun.total_conversations)) * 100)} />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Conversas analisadas", value: kpis.convs.toLocaleString("pt-BR") },
            { label: "Mensagens de clientes", value: kpis.msgs.toLocaleString("pt-BR") },
            { label: "Temas ativos", value: kpis.themes.toLocaleString("pt-BR") },
            {
              label: "Tema em alta",
              value: kpis.rising ? kpis.rising.theme : "—",
              hint: kpis.rising?.deltaPp != null ? `${kpis.rising.deltaPp >= 0 ? "+" : ""}${kpis.rising.deltaPp.toFixed(1)} p.p. vs. período anterior` : undefined,
            },
          ].map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold capitalize truncate">{c.value}</div>
                {c.hint && <div className="text-xs text-muted-foreground mt-1">{c.hint}</div>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <Label className="text-xs">Caixa de entrada</Label>
              <Select value={inbox} onValueChange={setInbox}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {inboxes.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label className="text-xs">Sentimento</Label>
              <Select value={sentiment} onValueChange={setSentiment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="negativo">Negativo</SelectItem>
                  <SelectItem value="neutro">Neutro</SelectItem>
                  <SelectItem value="positivo">Positivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Busca (tema, dor, palavra)</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ex.: cobrança" />
            </div>
            {termFilter && (
              <Badge variant="secondary" className="h-9 px-3 cursor-pointer" onClick={() => setTermFilter(null)}>
                termo: {termFilter} <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="temas">
          <TabsList>
            <TabsTrigger value="temas">Temas e dores</TabsTrigger>
            <TabsTrigger value="nuvem">Nuvem de palavras</TabsTrigger>
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="config">Catálogo e execuções</TabsTrigger>
          </TabsList>

          <TabsContent value="temas" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Ranking de temas</CardTitle>
                <CardDescription>
                  Comparação com {fmtBR(prevFrom)} → {fmtBR(prevTo)}. Clique num tema para ver as conversas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
                ) : ranking.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">
                    Nenhum tema no período. Use "Analisar período" para extrair os temas das mensagens dos clientes.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tema</TableHead>
                        <TableHead className="text-right">Conversas</TableHead>
                        <TableHead className="text-right">% do total</TableHead>
                        <TableHead className="text-right">Δ p.p.</TableHead>
                        <TableHead className="text-right">% negativo</TableHead>
                        <TableHead className="text-right">% urgência alta</TableHead>
                        <TableHead>Dores citadas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ranking.map((r) => (
                        <TableRow key={r.theme} className="cursor-pointer" onClick={() => setOpenTheme(r.theme)}>
                          <TableCell className="font-medium capitalize">{r.theme}</TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right">{r.share.toFixed(1)}%</TableCell>
                          <TableCell className={`text-right ${r.deltaPp != null && r.deltaPp > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {r.deltaPp == null ? "—" : `${r.deltaPp >= 0 ? "+" : ""}${r.deltaPp.toFixed(1)}`}
                          </TableCell>
                          <TableCell className="text-right">{r.negPct.toFixed(0)}%</TableCell>
                          <TableCell className="text-right">{r.altaPct.toFixed(0)}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">
                            {r.pains.join(" · ") || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nuvem" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Nuvem de palavras (falas dos clientes)</CardTitle>
                <CardDescription>Tamanho pelo número de conversas em que o termo aparece. Clique para filtrar.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingWords ? (
                  <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
                ) : words.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">Sem mensagens de clientes no período.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {words.map((w) => {
                      const ratio = Number(w.conversations) / maxWordConvs;
                      return (
                        <button
                          key={w.term}
                          onClick={() => setTermFilter(w.term)}
                          className="hover:underline text-primary"
                          style={{ fontSize: `${0.8 + ratio * 1.9}rem`, opacity: 0.55 + ratio * 0.45 }}
                          title={`${w.conversations} conversas · ${w.occurrences} menções`}
                        >
                          {w.term}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evolucao" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Evolução semanal dos temas</CardTitle>
                <CardDescription>Selecione os temas que quer acompanhar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {ranking.slice(0, 14).map((r) => {
                    const on = series.includes(r.theme);
                    return (
                      <Badge
                        key={r.theme}
                        variant={on ? "default" : "outline"}
                        className="cursor-pointer capitalize"
                        onClick={() =>
                          setSelectedSeries((prev) => {
                            const base = prev.length ? prev : topThemes.slice(0, 4);
                            return base.includes(r.theme) ? base.filter((t) => t !== r.theme) : [...base, r.theme];
                          })
                        }
                      >
                        {r.theme}
                      </Badge>
                    );
                  })}
                </div>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <RTooltip />
                      <Legend />
                      {series.map((s, i) => (
                        <Line
                          key={s}
                          type="monotone"
                          dataKey={s}
                          stroke={`hsl(var(--chart-${(i % 5) + 1}))`}
                          strokeWidth={2}
                          label={{ position: "top", fontSize: 10 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Catálogo de temas</CardTitle>
                  <CardDescription>Renomeie, oculte ou consolide os temas descobertos pela IA.</CardDescription>
                </div>
                <Button variant="outline" onClick={consolidate} disabled={busy}>
                  <Sparkles className="h-4 w-4 mr-2" /> Consolidar temas
                </Button>
              </CardHeader>
              <CardContent>
                {catalog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum tema canônico ainda. Rode "Consolidar temas" depois de analisar um período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tema canônico</TableHead>
                        <TableHead>Sinônimos</TableHead>
                        <TableHead className="w-[160px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalog.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Input
                              defaultValue={c.canonical_name}
                              className="h-8"
                              onBlur={(e) => {
                                const v = e.target.value.trim().toLowerCase();
                                if (v && v !== c.canonical_name) updateCatalog(c.id, { canonical_name: v });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(c.synonyms || []).join(", ") || "—"}
                          </TableCell>
                          <TableCell className="space-x-2">
                            <Button size="sm" variant="ghost" onClick={() => updateCatalog(c.id, { is_active: !c.is_active })}>
                              {c.is_active ? "Ocultar" : "Reexibir"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await supabase.from("chatwoot_theme_catalog").delete().eq("id", c.id);
                                qc.invalidateQueries({ queryKey: ["voc-catalog"] });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Últimas execuções</CardTitle>
                <CardDescription>A rotina automática processa o dia anterior todas as manhãs.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Início</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Processadas</TableHead>
                      <TableHead className="text-right">Falhas</TableHead>
                      <TableHead>Obs.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">
                          {new Date(r.started_at).toLocaleString("pt-BR", { timeZone: SP_TZ })}
                        </TableCell>
                        <TableCell className="text-xs">{r.kind}</TableCell>
                        <TableCell className="text-xs">{fmtBR(r.period_start)} → {fmtBR(r.period_end)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "done" ? "secondary" : r.status === "running" ? "default" : "destructive"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{r.processed}/{r.total_conversations}</TableCell>
                        <TableCell className="text-right">{r.failed}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                          {r.paused_reason || r.message || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {runs.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Nenhuma execução ainda.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!openTheme} onOpenChange={(o) => !o && setOpenTheme(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="capitalize">{openTheme} · {drill.length} conversas</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {drill.map((r) => {
                const url = buildConversationUrl(r.conversation_id);
                const quotes = (Array.isArray(r.themes) ? r.themes : []).map((t: any) => t?.quote).filter(Boolean);
                return (
                  <div key={r.conversation_id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>#{r.conversation_id}</span>
                      <span>{fmtBR(r.day_sp)}</span>
                      {r.inbox_name && <Badge variant="outline">{r.inbox_name}</Badge>}
                      {r.assignee_name && <span>{r.assignee_name}</span>}
                      {r.sentiment && <Badge variant={r.sentiment === "negativo" ? "destructive" : "secondary"}>{SENT_LABEL[r.sentiment] || r.sentiment}</Badge>}
                      {r.urgency && <Badge variant="outline">Urgência {URG_LABEL[r.urgency] || r.urgency}</Badge>}
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                          Abrir no Chatwoot <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {r.main_pain && <p className="text-sm"><span className="font-medium">Dor: </span>{r.main_pain}</p>}
                    {r.summary && <p className="text-sm text-muted-foreground">{r.summary}</p>}
                    {quotes.length > 0 && (
                      <ul className="text-xs italic text-muted-foreground list-disc pl-5">
                        {quotes.map((q: string, i: number) => <li key={i}>"{q}"</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
