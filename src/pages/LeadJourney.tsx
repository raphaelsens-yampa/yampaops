import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/MetricCard";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Download, Users, MessageCircle, DollarSign, Target } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts";
import { format, subDays } from "date-fns";

type Bucket = "<24h" | "1-3d" | "4-7d" | ">7d" | "Sem contato";

interface Row {
  id: string; name: string; contact_name: string | null; email: string | null; phone: string | null;
  consultant_id: string | null; consultant_name: string | null;
  origin: string | null; sub_origin: string | null; stage: string;
  opportunity_created_at: string;
  first_contact_at: string | null; hours_to_contact: number | null; bucket: Bucket;
  match_method: "phone" | "email" | null;
  match_reason?: string;
  matched_conversation_ids?: number[];
  matched_conversations?: Array<{ id: number; contact_email: string | null; contact_phone: string | null; first_contact_message_at: string | null; opened_at: string | null }>;
  is_paying: boolean; mrr: number; converted_at: string | null;
}

interface Report {
  kpis: { leads: number; contacted: number; contacted_pct: number; in_sla: number; in_sla_pct: number; paying: number; paying_pct: number; mrr_total: number };
  sla_buckets: { bucket: Bucket; count: number }[];
  timeseries: { date: string; leads: number; contacted: number; paying: number }[];
  by_consultant: { key: string; label: string; leads: number; contacted: number; in_sla: number; paying: number; mrr: number }[];
  by_origin: { key: string; label: string; leads: number; contacted: number; in_sla: number; paying: number; mrr: number }[];
  match_stats?: { matched_by_phone: number; matched_by_email: number; cw_phone_keys: number; cw_email_keys: number; contacts_with_phone: number; contacts_with_email: number };
  rows: Row[];
}

const BUCKET_COLORS: Record<Bucket, string> = {
  "<24h": "hsl(var(--success))",
  "1-3d": "hsl(var(--primary))",
  "4-7d": "hsl(var(--warning))",
  ">7d": "hsl(var(--destructive))",
  "Sem contato": "hsl(var(--muted-foreground))",
};

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function downloadCsv(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function LeadJourney() {
  const [pipelineId, setPipelineId] = useState<string>("");
  const [start, setStart] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [end, setEnd] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const { data: pipelines } = useQuery({
    queryKey: ["lj-pipelines"],
    queryFn: async () => {
      const { data } = await supabase.from("pipelines").select("id, name, is_default").order("is_default", { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    if (!pipelineId && pipelines?.length) {
      const def = pipelines.find((p: any) => p.is_default) || pipelines[0];
      setPipelineId(def.id);
    }
  }, [pipelines, pipelineId]);

  const { data: report, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["lead-journey", pipelineId, start, end],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("lead-journey-report", {
        body: {
          pipeline_id: pipelineId,
          start: new Date(start + "T00:00:00").toISOString(),
          end: new Date(end + "T23:59:59").toISOString(),
        },
      });
      if (error) throw error;
      return data as Report;
    },
  });

  const k = report?.kpis;

  const slaChartData = useMemo(
    () => (report?.sla_buckets || []).map((b) => ({ bucket: b.bucket, count: b.count, fill: BUCKET_COLORS[b.bucket] })),
    [report],
  );

  return (
    <Layout>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Jornada do Lead</h1>
            <p className="text-muted-foreground text-sm">ActiveCampaign → Chatwoot → Stripe</p>
          </div>
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline AC</TabsTrigger>
            <TabsTrigger value="csv">Auditoria via CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-6 mt-4">
            <CsvAuditTab />
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6 mt-4">

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Pipeline AC</Label>
                <Select value={pipelineId} onValueChange={setPipelineId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {(pipelines || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Até</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => refetch()} disabled={isFetching} className="w-full">
                  {isFetching ? "Carregando..." : "Atualizar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard title="Leads (AC)" value={k?.leads ?? 0} icon={<Users className="h-5 w-5" />} />
          <MetricCard title="Contactados" value={k?.contacted ?? 0} subtitle={k ? pct(k.contacted_pct) : "—"} icon={<MessageCircle className="h-5 w-5" />} />
          <MetricCard title="No SLA (≤3d)" value={k?.in_sla ?? 0} subtitle={k ? pct(k.in_sla_pct) : "—"} icon={<Target className="h-5 w-5" />} />
          <MetricCard title="Pagantes" value={k?.paying ?? 0} subtitle={k ? pct(k.paying_pct) : "—"} icon={<DollarSign className="h-5 w-5" />} />
          <MetricCard title="MRR Total" value={k ? brl(k.mrr_total) : "—"} icon={<DollarSign className="h-5 w-5" />} />
        </div>

        {report?.match_stats && (
          <div className="text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2">
            <span className="font-medium">Match Chatwoot:</span>{" "}
            {report.match_stats.matched_by_phone} por telefone · {report.match_stats.matched_by_email} por email (fallback) ·{" "}
            base: {report.match_stats.contacts_with_phone} contatos com tel, {report.match_stats.contacts_with_email} com email ·{" "}
            chaves Chatwoot: {report.match_stats.cw_phone_keys} tel / {report.match_stats.cw_email_keys} email
          </div>
        )}

        {/* Funil */}
        <Card>
          <CardHeader><CardTitle>Funil</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-2">
              <FunnelStep label="Leads AC" value={k?.leads ?? 0} sub="100%" tone="primary" />
              <Arrow />
              <FunnelStep label="Contactados Chatwoot" value={k?.contacted ?? 0} sub={k ? pct(k.contacted_pct) : "—"} tone="success" />
              <Arrow />
              <FunnelStep label="No SLA (≤3d)" value={k?.in_sla ?? 0} sub={k ? pct(k.in_sla_pct) : "—"} tone="warning" />
              <Arrow />
              <FunnelStep label="Pagantes Stripe" value={k?.paying ?? 0} sub={k ? pct(k.paying_pct) : "—"} tone="secondary" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* SLA buckets */}
          <Card>
            <CardHeader><CardTitle>Distribuição por SLA</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={slaChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="bucket" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Timeseries */}
          <Card>
            <CardHeader><CardTitle>Série temporal</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={report?.timeseries || []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="contacted" name="Contactados" stroke="hsl(var(--success))" strokeWidth={2} />
                    <Line type="monotone" dataKey="paying" name="Pagantes" stroke="hsl(var(--secondary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown */}
        <Card>
          <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="consultant">
              <TabsList>
                <TabsTrigger value="consultant">Por consultor</TabsTrigger>
                <TabsTrigger value="origin">Por origem</TabsTrigger>
              </TabsList>
              <TabsContent value="consultant">
                <BreakdownTable rows={report?.by_consultant || []} />
              </TabsContent>
              <TabsContent value="origin">
                <BreakdownTable rows={report?.by_origin || []} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Detalhada */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leads detalhados ({report?.rows.length || 0})</CardTitle>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`lead-journey-${start}_${end}.csv`, report?.rows || [])}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            <DetailTable rows={report?.rows || []} />
          </CardContent>
        </Card>

        {/* Debug match Chatwoot */}
        <DebugMatchSection rows={report?.rows || []} />

        {isLoading && <p className="text-sm text-muted-foreground text-center">Carregando relatório...</p>}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function FunnelStep({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "primary" | "success" | "warning" | "secondary" }) {
  const bg = {
    primary: "bg-primary/10 border-primary/30 text-primary",
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    secondary: "bg-secondary/10 border-secondary/30 text-secondary",
  }[tone];
  return (
    <div className={`rounded-lg border p-4 text-center ${bg}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-3xl font-heading font-bold mt-1">{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs mt-1 opacity-80">{sub}</div>
    </div>
  );
}

function Arrow() {
  return <ArrowRight className="hidden md:block mx-auto text-muted-foreground" />;
}

function BreakdownTable({ rows }: { rows: { key: string; label: string; leads: number; contacted: number; in_sla: number; paying: number; mrr: number }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sem dados.</p>;
  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Contactados</TableHead>
            <TableHead className="text-right">% SLA</TableHead>
            <TableHead className="text-right">Pagantes</TableHead>
            <TableHead className="text-right">Conv %</TableHead>
            <TableHead className="text-right">MRR</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.label}</TableCell>
              <TableCell className="text-right">{r.leads}</TableCell>
              <TableCell className="text-right">{r.contacted}</TableCell>
              <TableCell className="text-right">{r.leads ? pct((r.in_sla / r.leads) * 100) : "—"}</TableCell>
              <TableCell className="text-right">{r.paying}</TableCell>
              <TableCell className="text-right">{r.leads ? pct((r.paying / r.leads) * 100) : "—"}</TableCell>
              <TableCell className="text-right">{brl(r.mrr)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailTable({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0);
  const PAGE = 50;
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período.</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>1ª conversa</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead>Bucket</TableHead>
              <TableHead>Via</TableHead>
              <TableHead>Pagante</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead>Consultor</TableHead>
              <TableHead>Origem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs">{r.email || "—"}</TableCell>
                <TableCell className="text-xs">{format(new Date(r.opportunity_created_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell className="text-xs">{r.first_contact_at ? format(new Date(r.first_contact_at), "dd/MM/yy HH:mm") : "—"}</TableCell>
                <TableCell className="text-right text-xs">{r.hours_to_contact !== null ? r.hours_to_contact.toFixed(1) : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" style={{ borderColor: BUCKET_COLORS[r.bucket], color: BUCKET_COLORS[r.bucket] }}>
                    {r.bucket}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {r.match_method === "phone" ? "📱 tel" : r.match_method === "email" ? "✉️ email" : "—"}
                </TableCell>
                <TableCell>{r.is_paying ? <Badge className="bg-success">Sim</Badge> : <span className="text-muted-foreground text-xs">Não</span>}</TableCell>
                <TableCell className="text-right text-xs">{r.mrr ? brl(r.mrr) : "—"}</TableCell>
                <TableCell className="text-xs">{r.consultant_name || "—"}</TableCell>
                <TableCell className="text-xs">{r.origin || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}

const CW_BASE = "https://chatwoot.yampa.com.br";
const CW_ACCOUNT = 1;

function DebugMatchSection({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === "matched") r = r.filter((x) => x.match_method);
    if (filter === "unmatched") r = r.filter((x) => !x.match_method);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter((x) =>
        (x.name || "").toLowerCase().includes(s) ||
        (x.email || "").toLowerCase().includes(s) ||
        (x.phone || "").toLowerCase().includes(s) ||
        (x.matched_conversation_ids || []).some((id) => String(id).includes(s))
      );
    }
    return r.slice(0, 200);
  }, [rows, filter, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    matched: rows.filter((r) => r.match_method).length,
    unmatched: rows.filter((r) => !r.match_method).length,
    by_phone: rows.filter((r) => r.match_method === "phone").length,
    by_email: rows.filter((r) => r.match_method === "email").length,
  }), [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 Debug: Match Chatwoot por lead</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Mostra exatamente qual conversa do Chatwoot foi vinculada a cada lead e o motivo do match.
          Total: {counts.total} · Match: {counts.matched} ({counts.by_phone} tel + {counts.by_email} email) · Sem match: {counts.unmatched}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="matched">Apenas com match</SelectItem>
              <SelectItem value="unmatched">Apenas sem match</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar nome, email, telefone, ID conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <span className="text-xs text-muted-foreground ml-auto">Mostrando {filtered.length} (limite 200)</span>
        </div>

        <div className="space-y-2">
          {filtered.map((r) => {
            const isOpen = !!expanded[r.id];
            const convs = r.matched_conversations || [];
            return (
              <div key={r.id} className="border rounded-md">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [r.id]: !isOpen }))}
                  className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/40"
                >
                  <Badge variant={r.match_method ? "default" : "outline"} className="shrink-0">
                    {r.match_method === "phone" ? "📱 tel" : r.match_method === "email" ? "✉️ email" : "— sem"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.name || r.contact_name || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.email || "sem email"} · {r.phone || "sem telefone"} · {convs.length} conversa(s)
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
                </button>
                {isOpen && (
                  <div className="px-3 py-3 border-t bg-muted/20 space-y-2 text-xs">
                    <div><span className="font-semibold">Motivo:</span> {r.match_reason || "—"}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div><span className="text-muted-foreground">Lead ID:</span> <code className="text-[10px]">{r.id}</code></div>
                      <div><span className="text-muted-foreground">Criado:</span> {new Date(r.opportunity_created_at).toLocaleString("pt-BR")}</div>
                      <div><span className="text-muted-foreground">1º contato:</span> {r.first_contact_at ? new Date(r.first_contact_at).toLocaleString("pt-BR") : "—"}</div>
                      <div><span className="text-muted-foreground">Bucket:</span> {r.bucket}</div>
                    </div>
                    {convs.length > 0 ? (
                      <div>
                        <div className="font-semibold mb-1">Conversas Chatwoot vinculadas:</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Email contato</TableHead>
                              <TableHead>Telefone contato</TableHead>
                              <TableHead>1ª msg cliente</TableHead>
                              <TableHead>Aberta em</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {convs.map((cv) => (
                              <TableRow key={cv.id}>
                                <TableCell><code>{cv.id}</code></TableCell>
                                <TableCell>{cv.contact_email || "—"}</TableCell>
                                <TableCell>{cv.contact_phone || "—"}</TableCell>
                                <TableCell>{cv.first_contact_message_at ? new Date(cv.first_contact_message_at).toLocaleString("pt-BR") : "—"}</TableCell>
                                <TableCell>{cv.opened_at ? new Date(cv.opened_at).toLocaleString("pt-BR") : "—"}</TableCell>
                                <TableCell>
                                  <a
                                    href={`${CW_BASE}/app/accounts/${CW_ACCOUNT}/conversations/${cv.id}`}
                                    target="_blank" rel="noreferrer"
                                    className="text-primary hover:underline"
                                  >abrir ↗</a>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-muted-foreground italic">Nenhuma conversa Chatwoot encontrada para este lead.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum lead corresponde aos filtros.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
