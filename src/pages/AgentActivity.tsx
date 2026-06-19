import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MetricCard } from "@/components/MetricCard";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";
import { Users, MessageCircle, CheckCircle2, Clock, Download, RefreshCw, ExternalLink, CalendarIcon } from "lucide-react";
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

type Msg = {
  chatwoot_message_id: number;
  chatwoot_conversation_id: number;
  inbox_name: string | null;
  sender_type: "agent" | "client" | "system";
  sender_name: string | null;
  sender_email: string | null;
  message_type: number | null;
  content_preview: string | null;
  message_created_at: string;
};

function isoDay(d: string) {
  return d.slice(0, 10);
}
function isoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
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

function DateRangeFilter({
  from, to, setFrom, setTo,
}: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const [anchor, setAnchor] = useState<Date | null>(null);
  const selected: DateRange | undefined = anchor
    ? { from: anchor, to: undefined }
    : (from && to ? { from: parseISO(from), to: parseISO(to) } : undefined);

  return (
    <Popover onOpenChange={(open) => { if (open) setAnchor(null); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-left font-normal w-[260px]", !from && !to && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {from && to
            ? <>{format(parseISO(from), "dd/MM/yy", { locale: ptBR })} – {format(parseISO(to), "dd/MM/yy", { locale: ptBR })}</>
            : <span>Período personalizado</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={from ? parseISO(from) : undefined}
          selected={selected}
          onDayClick={(day) => {
            if (!anchor) { setAnchor(day); setFrom(isoDate(day)); setTo(""); }
            else {
              const start = anchor < day ? anchor : day;
              const end = anchor < day ? day : anchor;
              setFrom(isoDate(start)); setTo(isoDate(end)); setAnchor(null);
            }
          }}
          numberOfMonths={2}
          locale={ptBR}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

export default function AgentActivity() {
  const { buildConversationUrl } = useChatwootIntegration();
  const [mode, setMode] = useState<"conversas" | "mensagens">("conversas");

  // Date range
  const today = new Date();
  const defaultFrom = new Date(); defaultFrom.setDate(today.getDate() - 7);
  const [from, setFrom] = useState<string>(isoDate(defaultFrom));
  const [to, setTo] = useState<string>(isoDate(today));

  const [inboxFilter, setInboxFilter] = useState<string>("__all__");
  const [agenteFilter, setAgenteFilter] = useState<string>("__all__");
  const [respondidoFilter, setRespondidoFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  const sinceIso = useMemo(() => from ? new Date(`${from}T00:00:00`).toISOString() : new Date(0).toISOString(), [from]);
  const untilIso = useMemo(() => to ? new Date(`${to}T23:59:59`).toISOString() : new Date().toISOString(), [to]);

  const setQuickRange = (n: number) => {
    const t = new Date();
    const f = new Date(); f.setDate(t.getDate() - (n - 1));
    setFrom(isoDate(f)); setTo(isoDate(t));
  };

  // Conversas
  const { data: convos = [], isLoading: loadingConvos } = useQuery({
    queryKey: ["agent-activity-convos", sinceIso, untilIso],
    queryFn: async () => {
      const rows: Convo[] = [];
      const page = 1000; let off = 0;
      while (true) {
        const { data, error } = await supabase
          .from("chatwoot_conversations")
          .select("chatwoot_conversation_id, chatwoot_contact_id, contact_name, contact_email, contact_phone, assignee_name, assignee_email, inbox_name, status, created_at, first_contact_message_at, first_response_at, tm1r_seconds, tabulacao_atendimento")
          .gte("created_at", sinceIso).lte("created_at", untilIso)
          .order("created_at", { ascending: false })
          .range(off, off + page - 1);
        if (error) throw error;
        rows.push(...((data as any[]) || []));
        if (!data || data.length < page) break;
        off += page;
        if (off > 20000) break;
      }
      return rows;
    },
  });

  // Mensagens
  const { data: msgs = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["agent-activity-msgs", sinceIso, untilIso],
    enabled: mode === "mensagens",
    queryFn: async () => {
      const rows: Msg[] = [];
      const page = 1000; let off = 0;
      while (true) {
        const { data, error } = await supabase
          .from("chatwoot_messages")
          .select("chatwoot_message_id, chatwoot_conversation_id, inbox_name, sender_type, sender_name, sender_email, message_type, content_preview, message_created_at")
          .gte("message_created_at", sinceIso).lte("message_created_at", untilIso)
          .eq("is_private", false)
          .order("message_created_at", { ascending: false })
          .range(off, off + page - 1);
        if (error) throw error;
        rows.push(...((data as any[]) || []));
        if (!data || data.length < page) break;
        off += page;
        if (off > 50000) break;
      }
      return rows;
    },
  });

  const isLoading = mode === "conversas" ? loadingConvos : loadingMsgs;

  const inboxes = useMemo(() => Array.from(new Set([
    ...convos.map((c) => c.inbox_name).filter(Boolean),
    ...msgs.map((m) => m.inbox_name).filter(Boolean),
  ])) as string[], [convos, msgs]);
  const agentes = useMemo(() => Array.from(new Set([
    ...convos.map((c) => c.assignee_name).filter(Boolean),
    ...msgs.filter((m) => m.sender_type === "agent").map((m) => m.sender_name).filter(Boolean),
  ])) as string[], [convos, msgs]);

  // Filtros aplicados a conversas
  const filteredConvos = useMemo(() => {
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

  // Filtros aplicados a mensagens
  const filteredMsgs = useMemo(() => msgs.filter((m) => {
    if (inboxFilter !== "__all__" && m.inbox_name !== inboxFilter) return false;
    if (agenteFilter !== "__all__" && m.sender_type === "agent" && m.sender_name !== agenteFilter) return false;
    return true;
  }), [msgs, inboxFilter, agenteFilter]);

  // KPIs
  const kpis = useMemo(() => {
    if (mode === "conversas") {
      const atendidas = filteredConvos.length;
      const respondidas = filteredConvos.filter((c) => c.first_contact_message_at).length;
      const tm1rs = filteredConvos.map((c) => c.tm1r_seconds).filter((v): v is number => typeof v === "number" && v > 0);
      const tm1rAvg = tm1rs.length ? Math.round(tm1rs.reduce((a, b) => a + b, 0) / tm1rs.length) : 0;
      const agentesAtivos = new Set(filteredConvos.map((c) => c.assignee_email || c.assignee_name).filter(Boolean)).size;
      return { primary: atendidas, secondary: respondidas, taxa: atendidas ? (respondidas / atendidas) * 100 : 0, tm1rAvg, agentesAtivos };
    } else {
      const enviadas = filteredMsgs.filter((m) => m.sender_type === "agent").length;
      const recebidas = filteredMsgs.filter((m) => m.sender_type === "client").length;
      const agentesAtivos = new Set(filteredMsgs.filter((m) => m.sender_type === "agent").map((m) => m.sender_email || m.sender_name).filter(Boolean)).size;
      return { primary: enviadas, secondary: recebidas, taxa: enviadas ? (recebidas / enviadas) * 100 : 0, tm1rAvg: 0, agentesAtivos };
    }
  }, [mode, filteredConvos, filteredMsgs]);

  // Por agente
  const porAgente = useMemo(() => {
    if (mode === "conversas") {
      const map = new Map<string, { agente: string; total: number; respondidas: number; tm1rs: number[]; dias: Set<string> }>();
      filteredConvos.forEach((c) => {
        const key = c.assignee_name || "— Sem agente —";
        if (!map.has(key)) map.set(key, { agente: key, total: 0, respondidas: 0, tm1rs: [], dias: new Set() });
        const row = map.get(key)!;
        row.total++;
        if (c.first_contact_message_at) row.respondidas++;
        if (c.tm1r_seconds) row.tm1rs.push(c.tm1r_seconds);
        row.dias.add(isoDay(c.created_at));
      });
      return Array.from(map.values()).map((r) => ({
        agente: r.agente, total: r.total, respondidas: r.respondidas,
        taxa: r.total ? (r.respondidas / r.total) * 100 : 0,
        tm1rAvg: r.tm1rs.length ? Math.round(r.tm1rs.reduce((a, b) => a + b, 0) / r.tm1rs.length) : 0,
        diasAtivos: r.dias.size, mediaDia: r.dias.size ? r.total / r.dias.size : 0,
      })).sort((a, b) => b.total - a.total);
    } else {
      const map = new Map<string, { agente: string; total: number; respondidas: number; dias: Set<string> }>();
      filteredMsgs.filter((m) => m.sender_type === "agent").forEach((m) => {
        const key = m.sender_name || "— Sem agente —";
        if (!map.has(key)) map.set(key, { agente: key, total: 0, respondidas: 0, dias: new Set() });
        const row = map.get(key)!;
        row.total++;
        row.dias.add(isoDay(m.message_created_at));
      });
      return Array.from(map.values()).map((r) => ({
        agente: r.agente, total: r.total, respondidas: 0, taxa: 0, tm1rAvg: 0,
        diasAtivos: r.dias.size, mediaDia: r.dias.size ? r.total / r.dias.size : 0,
      })).sort((a, b) => b.total - a.total);
    }
  }, [mode, filteredConvos, filteredMsgs]);

  // Matriz dia x agente
  const porDia = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    const diasSet = new Set<string>();
    const items = mode === "conversas"
      ? filteredConvos.map((c) => ({ d: isoDay(c.created_at), ag: c.assignee_name || "— Sem agente —" }))
      : filteredMsgs.filter((m) => m.sender_type === "agent").map((m) => ({ d: isoDay(m.message_created_at), ag: m.sender_name || "— Sem agente —" }));
    items.forEach(({ d, ag }) => {
      diasSet.add(d);
      if (!map.has(d)) map.set(d, new Map());
      map.get(d)!.set(ag, (map.get(d)!.get(ag) || 0) + 1);
    });
    const dias = Array.from(diasSet).sort().reverse();
    return { dias, map };
  }, [mode, filteredConvos, filteredMsgs]);

  const formatSeconds = (s: number) => {
    if (!s) return "—";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  const exportContatados = () => {
    const rows = filteredConvos.map((c) => ({
      contato: c.contact_name || "", email: c.contact_email || "", telefone: c.contact_phone || "",
      agente: c.assignee_name || "", inbox: c.inbox_name || "",
      criado_em: c.created_at, respondeu: c.first_contact_message_at ? "sim" : "nao",
      primeira_resposta_agente: c.first_response_at || "", tm1r_segundos: c.tm1r_seconds || "",
      status: c.status, tabulacao: c.tabulacao_atendimento || "", conversa_id: c.chatwoot_conversation_id,
    }));
    downloadCsv(`contactados_${from}_${to}.csv`, rows);
  };

  const sincronizarMensagens = async () => {
    setSyncing(true);
    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${projectUrl}/functions/v1/chatwoot-messages-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ since: from, until: to }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha na sincronização");
      toast.success(`Sincronizado: ${j.messages_upserted} mensagens em ${j.conversations_ok} conversas`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao sincronizar mensagens");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold">Atividade de Agentes</h1>
            <p className="text-sm text-muted-foreground">
              Conversas atendidas e mensagens trocadas via Chatwoot.
            </p>

          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as any)} variant="outline" size="sm">
              <ToggleGroupItem value="conversas">Conversas</ToggleGroupItem>
              <ToggleGroupItem value="mensagens">Mensagens</ToggleGroupItem>
            </ToggleGroup>
            <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} />
            <Select onValueChange={(v) => setQuickRange(Number(v))}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Atalhos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="14">Últimos 14 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
              </SelectContent>
            </Select>
            {mode === "mensagens" && (
              <Button size="sm" variant="outline" onClick={sincronizarMensagens} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                Sincronizar mensagens
              </Button>
            )}
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
            {mode === "conversas" && (
              <Select value={respondidoFilter} onValueChange={setRespondidoFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cliente respondeu?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Respondeu? Todos</SelectItem>
                  <SelectItem value="sim">Cliente respondeu</SelectItem>
                  <SelectItem value="nao">Sem resposta do cliente</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Input className="w-[260px]" placeholder="Buscar nome / email / telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid gap-3 md:grid-cols-4">
          {mode === "conversas" ? (
            <>
              <MetricCard title="Conversas atendidas" value={kpis.primary} icon={<MessageCircle className="h-4 w-4" />} subtitle={`${from} → ${to}`} />
              <MetricCard title="Cliente respondeu" value={kpis.secondary} icon={<CheckCircle2 className="h-4 w-4" />} subtitle={`${kpis.taxa.toFixed(1)}% de taxa`} />
              <MetricCard title="Agentes ativos" value={kpis.agentesAtivos} icon={<Users className="h-4 w-4" />} />
              <MetricCard title="TM1R médio" value={formatSeconds(kpis.tm1rAvg)} icon={<Clock className="h-4 w-4" />} subtitle="Tempo da 1ª resposta" />
            </>
          ) : (
            <>
              <MetricCard title="Mensagens enviadas" value={kpis.primary} icon={<MessageCircle className="h-4 w-4" />} subtitle={`${from} → ${to}`} />
              <MetricCard title="Mensagens recebidas" value={kpis.secondary} icon={<CheckCircle2 className="h-4 w-4" />} subtitle={`${kpis.taxa.toFixed(1)}% de retorno`} />
              <MetricCard title="Agentes ativos" value={kpis.agentesAtivos} icon={<Users className="h-4 w-4" />} />
              <MetricCard title="Total trocado" value={kpis.primary + kpis.secondary} icon={<Clock className="h-4 w-4" />} subtitle="Enviadas + recebidas" />
            </>
          )}
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="contactados">Contactados</TabsTrigger>
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
                      <TableHead className="text-right">{mode === "conversas" ? "Atendidas" : "Mensagens"}</TableHead>
                      {mode === "conversas" && <TableHead className="text-right">Com resposta</TableHead>}
                      {mode === "conversas" && <TableHead className="text-right">Taxa</TableHead>}
                      {mode === "conversas" && <TableHead className="text-right">TM1R</TableHead>}
                      <TableHead className="text-right">Dias ativos</TableHead>
                      <TableHead className="text-right">Média/dia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>}
                    {!isLoading && porAgente.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem dados no período.{mode === "mensagens" && " Clique em 'Sincronizar mensagens' para buscar do Chatwoot."}</TableCell></TableRow>}
                    {porAgente.map((r) => (
                      <TableRow key={r.agente}>
                        <TableCell>{r.agente}</TableCell>
                        <TableCell className="text-right font-medium">{r.total}</TableCell>
                        {mode === "conversas" && <TableCell className="text-right">{r.respondidas}</TableCell>}
                        {mode === "conversas" && <TableCell className="text-right">{r.taxa.toFixed(1)}%</TableCell>}
                        {mode === "conversas" && <TableCell className="text-right">{formatSeconds(r.tm1rAvg)}</TableCell>}
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
                <CardTitle className="text-base">Lista de contactados ({filteredConvos.length})</CardTitle>
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
                    {filteredConvos.slice(0, 500).map((c) => {
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
                {filteredConvos.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-2">Exibindo 500 de {filteredConvos.length}. Refine filtros ou use Exportar CSV.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          
        </Tabs>
      </div>
    </Layout>
  );
}

