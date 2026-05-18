import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/MetricCard";
import { supabase } from "@/integrations/supabase/client";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";
import { Users, MessageCircle, CheckCircle2, Clock, Download, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Convo = {
  chatwoot_conversation_id: number;
  chatwoot_contact_id: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  inbox_name: string | null;
  status: string;
  created_at: string;
  first_contact_message_at: string | null;
  first_response_at: string | null;
  tm1r_seconds: number | null;
  tabulacao_atendimento: string | null;
};

function isoDay(d: string) {
  return d.slice(0, 10);
}

function toCsv(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function downloadCsv(name: string, rows: Record<string, any>[]) {
  const csv = toCsv(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AgentActivity() {
  const { buildConversationUrl } = useChatwootIntegration();
  const [days, setDays] = useState<number>(7);
  const [inboxFilter, setInboxFilter] = useState<string>("__all__");
  const [agenteFilter, setAgenteFilter] = useState<string>("__all__");
  const [respondidoFilter, setRespondidoFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [days]);

  const { data: convos = [], isLoading } = useQuery({
    queryKey: ["agent-activity-convos", days],
    queryFn: async () => {
      const rows: Convo[] = [];
      const page = 1000;
      let from = 0;
      // Paginate (default supabase limit 1000)
      while (true) {
        const { data, error } = await supabase
          .from("chatwoot_conversations")
          .select("chatwoot_conversation_id, chatwoot_contact_id, contact_name, contact_email, contact_phone, assignee_name, assignee_email, inbox_name, status, created_at, first_contact_message_at, first_response_at, tm1r_seconds, tabulacao_atendimento")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, from + page - 1);
        if (error) throw error;
        rows.push(...((data as any[]) || []));
        if (!data || data.length < page) break;
        from += page;
        if (from > 20000) break;
      }
      return rows;
    },
  });

  const inboxes = useMemo(() => Array.from(new Set(convos.map((c) => c.inbox_name).filter(Boolean))) as string[], [convos]);
  const agentes = useMemo(() => Array.from(new Set(convos.map((c) => c.assignee_name).filter(Boolean))) as string[], [convos]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return convos.filter((c) => {
      if (inboxFilter !== "__all__" && c.inbox_name !== inboxFilter) return false;
      if (agenteFilter !== "__all__" && c.assignee_name !== agenteFilter) return false;
      if (respondidoFilter === "sim" && !c.first_contact_message_at) return false;
      if (respondidoFilter === "nao" && c.first_contact_message_at) return false;
      if (s) {
        const hay = `${c.contact_name || ""} ${c.contact_email || ""} ${c.contact_phone || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [convos, inboxFilter, agenteFilter, respondidoFilter, search]);

  // KPIs
  const kpis = useMemo(() => {
    const atendidas = filtered.length;
    const respondidas = filtered.filter((c) => c.first_contact_message_at).length;
    const tm1rs = filtered.map((c) => c.tm1r_seconds).filter((v): v is number => typeof v === "number" && v > 0);
    const tm1rAvg = tm1rs.length ? Math.round(tm1rs.reduce((a, b) => a + b, 0) / tm1rs.length) : 0;
    const agentesAtivos = new Set(filtered.map((c) => c.assignee_email || c.assignee_name).filter(Boolean)).size;
    return { atendidas, respondidas, taxa: atendidas ? (respondidas / atendidas) * 100 : 0, tm1rAvg, agentesAtivos };
  }, [filtered]);

  // Por agente
  const porAgente = useMemo(() => {
    const map = new Map<string, { agente: string; total: number; respondidas: number; tm1rs: number[]; dias: Set<string> }>();
    filtered.forEach((c) => {
      const key = c.assignee_name || "— Sem agente —";
      if (!map.has(key)) map.set(key, { agente: key, total: 0, respondidas: 0, tm1rs: [], dias: new Set() });
      const row = map.get(key)!;
      row.total++;
      if (c.first_contact_message_at) row.respondidas++;
      if (c.tm1r_seconds) row.tm1rs.push(c.tm1r_seconds);
      row.dias.add(isoDay(c.created_at));
    });
    return Array.from(map.values())
      .map((r) => ({
        agente: r.agente,
        total: r.total,
        respondidas: r.respondidas,
        taxa: r.total ? (r.respondidas / r.total) * 100 : 0,
        tm1rAvg: r.tm1rs.length ? Math.round(r.tm1rs.reduce((a, b) => a + b, 0) / r.tm1rs.length) : 0,
        diasAtivos: r.dias.size,
        mediaDia: r.dias.size ? r.total / r.dias.size : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Por dia × agente (matriz)
  const porDia = useMemo(() => {
    const map = new Map<string, Map<string, number>>(); // dia -> agente -> count
    const diasSet = new Set<string>();
    filtered.forEach((c) => {
      const d = isoDay(c.created_at);
      diasSet.add(d);
      const ag = c.assignee_name || "— Sem agente —";
      if (!map.has(d)) map.set(d, new Map());
      map.get(d)!.set(ag, (map.get(d)!.get(ag) || 0) + 1);
    });
    const dias = Array.from(diasSet).sort().reverse();
    return { dias, map };
  }, [filtered]);

  const formatSeconds = (s: number) => {
    if (!s) return "—";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  const exportContatados = () => {
    const rows = filtered.map((c) => ({
      contato: c.contact_name || "",
      email: c.contact_email || "",
      telefone: c.contact_phone || "",
      agente: c.assignee_name || "",
      inbox: c.inbox_name || "",
      criado_em: c.created_at,
      respondeu: c.first_contact_message_at ? "sim" : "nao",
      primeira_resposta_agente: c.first_response_at || "",
      tm1r_segundos: c.tm1r_seconds || "",
      status: c.status,
      tabulacao: c.tabulacao_atendimento || "",
      conversa_id: c.chatwoot_conversation_id,
    }));
    downloadCsv(`contactados_${days}d.csv`, rows);
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold">Atividade de Agentes</h1>
            <p className="text-sm text-muted-foreground">
              Conversas atendidas via Chatwoot, taxa de resposta e cobertura da base do ActiveCampaign.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="14">Últimos 14 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filtros globais */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2">
            <Select value={inboxFilter} onValueChange={setInboxFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Inbox" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os inboxes</SelectItem>
                {inboxes.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={agenteFilter} onValueChange={setAgenteFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Agente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os agentes</SelectItem>
                {agentes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={respondidoFilter} onValueChange={setRespondidoFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cliente respondeu?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Respondeu? Todos</SelectItem>
                <SelectItem value="sim">Cliente respondeu</SelectItem>
                <SelectItem value="nao">Sem resposta do cliente</SelectItem>
              </SelectContent>
            </Select>
            <Input className="w-[260px]" placeholder="Buscar nome / email / telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard title="Conversas atendidas" value={kpis.atendidas} icon={<MessageCircle className="h-4 w-4" />} subtitle={`${days} dia(s)`} />
          <MetricCard title="Cliente respondeu" value={kpis.respondidas} icon={<CheckCircle2 className="h-4 w-4" />} subtitle={`${kpis.taxa.toFixed(1)}% de taxa`} />
          <MetricCard title="Agentes ativos" value={kpis.agentesAtivos} icon={<Users className="h-4 w-4" />} />
          <MetricCard title="TM1R médio" value={formatSeconds(kpis.tm1rAvg)} icon={<Clock className="h-4 w-4" />} subtitle="Tempo da 1ª resposta" />
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="contactados">Contactados</TabsTrigger>
            <TabsTrigger value="cobertura">Cobertura vs AC</TabsTrigger>
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Por agente</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-right">Atendidas</TableHead>
                      <TableHead className="text-right">Com resposta</TableHead>
                      <TableHead className="text-right">Taxa</TableHead>
                      <TableHead className="text-right">TM1R</TableHead>
                      <TableHead className="text-right">Dias ativos</TableHead>
                      <TableHead className="text-right">Média/dia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>}
                    {!isLoading && porAgente.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>}
                    {porAgente.map((r) => (
                      <TableRow key={r.agente}>
                        <TableCell>{r.agente}</TableCell>
                        <TableCell className="text-right font-medium">{r.total}</TableCell>
                        <TableCell className="text-right">{r.respondidas}</TableCell>
                        <TableCell className="text-right">{r.taxa.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{formatSeconds(r.tm1rAvg)}</TableCell>
                        <TableCell className="text-right">{r.diasAtivos}</TableCell>
                        <TableCell className="text-right">{r.mediaDia.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Volume diário por agente</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      {porAgente.slice(0, 8).map((a) => <TableHead key={a.agente} className="text-right">{a.agente}</TableHead>)}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porDia.dias.map((d) => {
                      const row = porDia.map.get(d)!;
                      const total = Array.from(row.values()).reduce((a, b) => a + b, 0);
                      return (
                        <TableRow key={d}>
                          <TableCell>{d.split("-").reverse().join("/")}</TableCell>
                          {porAgente.slice(0, 8).map((a) => (
                            <TableCell key={a.agente} className="text-right">{row.get(a.agente) || 0}</TableCell>
                          ))}
                          <TableCell className="text-right font-medium">{total}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contactados */}
          <TabsContent value="contactados">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Lista de contactados ({filtered.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={exportContatados}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
              </CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contato</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Inbox</TableHead>
                      <TableHead>1ª interação</TableHead>
                      <TableHead>Respondeu?</TableHead>
                      <TableHead>TM1R</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 500).map((c) => {
                      const url = buildConversationUrl(c.chatwoot_conversation_id);
                      return (
                        <TableRow key={c.chatwoot_conversation_id}>
                          <TableCell className="max-w-[200px] truncate">{c.contact_name || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{c.contact_email || "—"}</TableCell>
                          <TableCell>{c.contact_phone || "—"}</TableCell>
                          <TableCell>{c.assignee_name || "—"}</TableCell>
                          <TableCell>{c.inbox_name || "—"}</TableCell>
                          <TableCell>{new Date(c.created_at).toLocaleString("pt-BR")}</TableCell>
                          <TableCell>
                            {c.first_contact_message_at
                              ? <Badge variant="default">Sim</Badge>
                              : <Badge variant="secondary">Não</Badge>}
                          </TableCell>
                          <TableCell>{formatSeconds(c.tm1r_seconds || 0)}</TableCell>
                          <TableCell>
                            {url && (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
                                Abrir <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filtered.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-2">Exibindo 500 de {filtered.length}. Refine filtros ou use Exportar CSV.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cobertura vs AC */}
          <TabsContent value="cobertura">
            <CoberturaAC />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function CoberturaAC() {
  const [listId, setListId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [agenteFilter, setAgenteFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  const { data: lists, isLoading: loadingLists, refetch: refetchLists } = useQuery({
    queryKey: ["ac-lists"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ac-list-contacts", {
        body: null,
        // GET via query string
      });
      // Workaround: supabase.functions.invoke is POST by default; we use fetch directly:
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${projectUrl}/functions/v1/ac-list-contacts?action=lists`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao buscar listas");
      return j.lists as { id: string; name: string; subscribers: number }[];
    },
  });

  const carregar = async () => {
    if (!listId) {
      toast.error("Selecione uma lista do AC");
      return;
    }
    setLoading(true);
    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${projectUrl}/functions/v1/ac-list-contacts?list_id=${encodeURIComponent(listId)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      setResult(j);
      toast.success(`${j.total} contatos carregados`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao cruzar com AC");
    } finally {
      setLoading(false);
    }
  };

  const rows: any[] = result?.rows || [];
  const agentes = useMemo(() => Array.from(new Set(rows.map((r) => r.agente).filter(Boolean))) as string[], [rows]);
  const filtered = useMemo(() => rows.filter((r) => {
    if (agenteFilter !== "__all__" && r.agente !== agenteFilter) return false;
    if (statusFilter === "contactados" && !r.contactado) return false;
    if (statusFilter === "nao_contactados" && r.contactado) return false;
    if (statusFilter === "responderam" && !r.respondeu) return false;
    return true;
  }), [rows, agenteFilter, statusFilter]);

  const porAgente = useMemo(() => {
    const map = new Map<string, { agente: string; total: number; responderam: number }>();
    rows.filter((r) => r.contactado).forEach((r) => {
      const k = r.agente || "—";
      if (!map.has(k)) map.set(k, { agente: k, total: 0, responderam: 0 });
      map.get(k)!.total++;
      if (r.respondeu) map.get(k)!.responderam++;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Cruzar lista do ActiveCampaign com conversas Chatwoot</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Escolha uma lista do AC (ex: Freetrials). Vamos buscar todos os contatos ativos e cruzar com os contatos do Chatwoot para mostrar quem já foi falado e quem ainda falta.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger className="w-[340px]">
                <SelectValue placeholder={loadingLists ? "Carregando listas..." : "Selecione uma lista do AC"} />
              </SelectTrigger>
              <SelectContent>
                {(lists || []).map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.subscribers})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={carregar} disabled={loading || !listId}>
              {loading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Cruzar agora
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetchLists()}>Recarregar listas</Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard title="Total da lista AC" value={result.total} icon={<Users className="h-4 w-4" />} />
            <MetricCard
              title="Já contactados"
              value={result.contactados}
              icon={<CheckCircle2 className="h-4 w-4" />}
              subtitle={`${result.total ? ((result.contactados / result.total) * 100).toFixed(1) : 0}% de cobertura`}
            />
            <MetricCard
              title="Responderam"
              value={result.responderam}
              icon={<MessageCircle className="h-4 w-4" />}
              subtitle={`${result.contactados ? ((result.responderam / result.contactados) * 100).toFixed(1) : 0}% dos contactados`}
            />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Cobertura por agente</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead className="text-right">Contatos atendidos</TableHead>
                    <TableHead className="text-right">Responderam</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porAgente.map((r) => (
                    <TableRow key={r.agente}>
                      <TableCell>{r.agente}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.responderam}</TableCell>
                      <TableCell className="text-right">{r.total ? ((r.responderam / r.total) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Contatos ({filtered.length} de {rows.length})</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="contactados">Contactados</SelectItem>
                    <SelectItem value="nao_contactados">Não contactados</SelectItem>
                    <SelectItem value="responderam">Que responderam</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={agenteFilter} onValueChange={setAgenteFilter}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Agente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os agentes</SelectItem>
                    {agentes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => downloadCsv(`cobertura_ac_lista_${listId}.csv`, filtered)}>
                  <Download className="h-4 w-4 mr-1" />Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Contactado?</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Respondeu?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 500).map((r) => (
                    <TableRow key={r.ac_contact_id}>
                      <TableCell>{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell>{r.email || "—"}</TableCell>
                      <TableCell>{r.phone || "—"}</TableCell>
                      <TableCell>{r.contactado ? <Badge>Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                      <TableCell>{r.agente || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.match_method || "—"}</TableCell>
                      <TableCell>{r.respondeu ? <Badge>Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 500 && (
                <p className="text-xs text-muted-foreground mt-2">Exibindo 500 de {filtered.length}. Use Exportar CSV para a lista completa.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
