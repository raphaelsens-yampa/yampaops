import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { Upload, ArrowLeft, ArrowRight, Trash2, Download, Users, MessageCircle, Reply, DollarSign, Clock, FileSpreadsheet } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts";

type Bucket = "<24h" | "1-3d" | "4-7d" | ">7d" | "Sem contato";
const BUCKET_COLORS: Record<string, string> = {
  "<24h": "hsl(var(--success))",
  "1-3d": "hsl(var(--primary))",
  "4-7d": "hsl(var(--warning))",
  ">7d": "hsl(var(--destructive))",
  "Sem contato": "hsl(var(--muted-foreground))",
};
const CW_BASE = "https://chatwoot.yampa.com.br";
const CW_ACCOUNT = 1;

interface ImportItem {
  id: string;
  name: string;
  source_file_name: string | null;
  total_rows: number;
  matched_chatwoot: number;
  matched_paying: number;
  status: string;
  created_at: string;
}

interface ReportRow {
  id: string;
  row_index: number;
  lead_email: string | null;
  lead_phone_raw: string | null;
  lead_phone_normalized: string | null;
  lead_name: string | null;
  lead_origin: string | null;
  lead_campaign: string | null;
  lead_created_at: string | null;
  cw_match_method: "phone" | "email" | null;
  cw_conversation_ids: number[];
  cw_first_contact_at: string | null;
  cw_first_agent_name: string | null;
  cw_first_agent_email: string | null;
  cw_total_conversations: number;
  cw_customer_replied: boolean;
  cw_last_status: string | null;
  cw_last_label: string | null;
  stripe_paying: boolean;
  stripe_converted_at: string | null;
  stripe_mrr: number;
  stripe_plan: string | null;
  hours_to_first_contact: number | null;
  sla_bucket: string | null;
}

interface ReportData {
  import: ImportItem;
  kpis: {
    total: number; contacted: number; contacted_pct: number;
    replied: number; replied_pct: number;
    paying: number; paying_pct: number;
    mrr_total: number; avg_sla_hours: number | null;
  };
  sla_buckets: { bucket: string; count: number }[];
  timeseries: { date: string; received: number; contacted: number; replied: number; paying: number }[];
  by_agent: { key: string; leads: number; contacted: number; replied: number; paying: number; mrr: number }[];
  by_origin: { key: string; leads: number; contacted: number; replied: number; paying: number; mrr: number }[];
  by_campaign: { key: string; leads: number; contacted: number; replied: number; paying: number; mrr: number }[];
  rows: ReportRow[];
}

function pct(n: number) { return `${n.toFixed(1)}%`; }
function brl(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleString("pt-BR") : "—"; }
function downloadCsv(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

type FieldKey = "email" | "phone" | "created_at" | "name" | "origin" | "campaign";
const FIELD_LABELS: Record<FieldKey, string> = {
  email: "Email *",
  phone: "Telefone *",
  created_at: "Data criação *",
  name: "Nome",
  origin: "Origem",
  campaign: "Campanha",
};

function suggestMapping(headers: string[]): Record<FieldKey, string | null> {
  const m: Record<FieldKey, string | null> = { email: null, phone: null, created_at: null, name: null, origin: null, campaign: null };
  for (const h of headers) {
    const l = h.toLowerCase().trim();
    if (!m.email && /e-?mail/.test(l)) m.email = h;
    else if (!m.phone && /(phone|telefone|whats|celular|tel)/.test(l)) m.phone = h;
    else if (!m.created_at && /(data|created|criado|criação|criacao|date)/.test(l)) m.created_at = h;
    else if (!m.name && /(nome|name)/.test(l)) m.name = h;
    else if (!m.origin && /(origem|origin|source|fonte)/.test(l)) m.origin = h;
    else if (!m.campaign && /(campanha|campaign|utm_campaign)/.test(l)) m.campaign = h;
  }
  return m;
}

export function CsvAuditTab() {
  const [view, setView] = useState<"list" | "wizard" | "report">("list");
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: imports, refetch: refetchImports } = useQuery({
    queryKey: ["lead-csv-imports"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("lead-csv-audit", { body: { action: "list" } });
      if (error) throw error;
      return (data?.imports || []) as ImportItem[];
    },
  });

  const { data: report, isLoading: loadingReport } = useQuery({
    queryKey: ["lead-csv-report", activeImportId],
    enabled: !!activeImportId && view === "report",
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("lead-csv-audit", {
        body: { action: "get", import_id: activeImportId },
      });
      if (error) throw error;
      return data as ReportData;
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("lead-csv-audit", { body: { action: "delete", import_id: id } });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Importação removida"); refetchImports(); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  if (view === "wizard") {
    return <CsvWizard onCancel={() => setView("list")} onDone={(id) => { setActiveImportId(id); setView("report"); qc.invalidateQueries({ queryKey: ["lead-csv-imports"] }); }} />;
  }

  if (view === "report" && activeImportId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => { setActiveImportId(null); setView("list"); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          {report && (
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`auditoria-${report.import.name}.csv`, report.rows)}>
              <Download className="h-4 w-4 mr-2" /> Exportar relatório completo
            </Button>
          )}
        </div>
        {loadingReport ? <p className="text-center text-muted-foreground py-8">Carregando...</p> : report ? <CsvReportView report={report} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Auditoria de Leads via CSV</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Suba o CSV do Marketing com email, telefone e data de criação. Cruzamos com 100% das conversas Chatwoot e pagamentos Stripe.
            </p>
          </div>
          <Button onClick={() => setView("wizard")}>
            <Upload className="h-4 w-4 mr-2" /> Nova importação
          </Button>
        </CardHeader>
        <CardContent>
          {!imports?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma importação ainda. Comece subindo um CSV.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">% Contactados</TableHead>
                  <TableHead className="text-right">% Pagantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-medium" onClick={() => { setActiveImportId(i.id); setView("report"); }}>{i.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground" onClick={() => { setActiveImportId(i.id); setView("report"); }}>{i.source_file_name || "—"}</TableCell>
                    <TableCell className="text-xs" onClick={() => { setActiveImportId(i.id); setView("report"); }}>{fmtDate(i.created_at)}</TableCell>
                    <TableCell className="text-right" onClick={() => { setActiveImportId(i.id); setView("report"); }}>{i.total_rows}</TableCell>
                    <TableCell className="text-right" onClick={() => { setActiveImportId(i.id); setView("report"); }}>{i.total_rows ? pct((i.matched_chatwoot / i.total_rows) * 100) : "—"}</TableCell>
                    <TableCell className="text-right" onClick={() => { setActiveImportId(i.id); setView("report"); }}>{i.total_rows ? pct((i.matched_paying / i.total_rows) * 100) : "—"}</TableCell>
                    <TableCell><Badge variant={i.status === "done" ? "default" : i.status === "error" ? "destructive" : "outline"}>{i.status}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); if (confirm("Remover esta importação?")) delMut.mutate(i.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
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

function CsvWizard({ onCancel, onDone }: { onCancel: () => void; onDone: (id: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({ email: null, phone: null, created_at: null, name: null, origin: null, campaign: null });
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
    if (!name) setName(f.name.replace(/\.csv$/i, ""));
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hd = (res.meta.fields || []).filter(Boolean);
        setHeaders(hd);
        setData(res.data as any[]);
        setMapping(suggestMapping(hd));
        setStep(2);
      },
      error: (err) => toast.error("Erro lendo CSV: " + err.message),
    });
  }

  function parseDateLocal(s: string | null | undefined): string | null {
    if (!s) return null;
    const t = String(s).trim();
    if (!t) return null;
    const iso = new Date(t);
    if (!isNaN(iso.getTime())) return iso.toISOString();
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (m) {
      const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
      const yyyy = y.length === 2 ? Number("20" + y) : Number(y);
      const dt = new Date(yyyy, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
      if (!isNaN(dt.getTime())) return dt.toISOString();
    }
    return null;
  }

  const validation = useMemo(() => {
    if (step < 3) return null;
    let valid = 0, invalid = 0, noDate = 0, noContact = 0;
    for (const r of data) {
      const email = mapping.email ? r[mapping.email] : null;
      const phone = mapping.phone ? r[mapping.phone] : null;
      const created = mapping.created_at ? parseDateLocal(r[mapping.created_at]) : null;
      if (!created) noDate++;
      if (!email && !phone) noContact++;
      if (created && (email || phone)) valid++;
      else invalid++;
    }
    return { valid, invalid, noDate, noContact };
  }, [step, data, mapping]);

  async function processNow() {
    if (!validation || !validation.valid) { toast.error("Nenhuma linha válida"); return; }
    setProcessing(true);
    try {
      const rows = data.map((r, idx) => {
        const created = mapping.created_at ? parseDateLocal(r[mapping.created_at]) : null;
        const email = mapping.email ? r[mapping.email] : null;
        const phone = mapping.phone ? r[mapping.phone] : null;
        if (!created || (!email && !phone)) return null;
        return {
          row_index: idx,
          email: email || null,
          phone: phone || null,
          created_at: created,
          name: mapping.name ? r[mapping.name] || null : null,
          origin: mapping.origin ? r[mapping.origin] || null : null,
          campaign: mapping.campaign ? r[mapping.campaign] || null : null,
          extra: {},
        };
      }).filter(Boolean);

      const { data: res, error } = await supabase.functions.invoke("lead-csv-audit", {
        body: {
          action: "process",
          name: name || "Sem nome",
          source_file_name: file?.name,
          column_mapping: mapping,
          rows,
        },
      });
      if (error) throw error;
      toast.success("Importação processada");
      onDone(res.import_id);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Nova importação · Passo {step} de 3</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {step === 1 && "Selecione o arquivo CSV"}
            {step === 2 && "Mapeie as colunas do seu CSV para os campos esperados"}
            {step === 3 && "Confirme e processe"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label>Nome da importação</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Leads Marketing - Out/2025" />
            </div>
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/30"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm">Clique ou arraste um CSV aqui</p>
              <p className="text-xs text-muted-foreground mt-1">Aceita qualquer estrutura — você mapeia as colunas no próximo passo</p>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="text-sm">
              Arquivo: <span className="font-medium">{file?.name}</span> · {data.length} linhas detectadas
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
                <div key={field}>
                  <Label>{FIELD_LABELS[field]}</Label>
                  <Select value={mapping[field] || "__none__"} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === "__none__" ? null : v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Não mapear —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <Label className="mb-2 block">Preview (5 primeiras linhas)</Label>
              <div className="overflow-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>{headers.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>{headers.map((h) => <TableCell key={h} className="text-xs">{String(r[h] ?? "").slice(0, 60)}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button
                disabled={!mapping.email && !mapping.phone || !mapping.created_at}
                onClick={() => setStep(3)}
              >Continuar <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
            {(!mapping.email && !mapping.phone) && <p className="text-xs text-destructive">Mapeie pelo menos email ou telefone</p>}
            {!mapping.created_at && <p className="text-xs text-destructive">Mapeie a data de criação</p>}
          </div>
        )}

        {step === 3 && validation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard title="Linhas válidas" value={validation.valid} />
              <MetricCard title="Descartadas" value={validation.invalid} />
              <MetricCard title="Sem data" value={validation.noDate} />
              <MetricCard title="Sem email/tel" value={validation.noContact} />
            </div>
            <div className="text-xs text-muted-foreground">
              Ao processar, vamos buscar todas as conversas Chatwoot que casem por telefone (prioritário) ou email (fallback) e cruzar com pagamentos Stripe.
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button onClick={processNow} disabled={processing || !validation.valid}>
                {processing ? "Processando..." : `Processar ${validation.valid} leads`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CsvReportView({ report }: { report: ReportData }) {
  const k = report.kpis;
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched" | "paying">("all");
  const [search, setSearch] = useState("");
  const [bdTab, setBdTab] = useState("agent");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const filteredRows = useMemo(() => {
    let r = report.rows;
    if (filter === "matched") r = r.filter((x) => x.cw_match_method);
    if (filter === "unmatched") r = r.filter((x) => !x.cw_match_method);
    if (filter === "paying") r = r.filter((x) => x.stripe_paying);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter((x) =>
        (x.lead_name || "").toLowerCase().includes(s) ||
        (x.lead_email || "").toLowerCase().includes(s) ||
        (x.lead_phone_raw || "").toLowerCase().includes(s) ||
        (x.cw_first_agent_name || "").toLowerCase().includes(s) ||
        (x.lead_origin || "").toLowerCase().includes(s)
      );
    }
    return r;
  }, [report.rows, filter, search]);

  const pageRows = filteredRows.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE));

  const slaChartData = report.sla_buckets.map((b) => ({ ...b, fill: BUCKET_COLORS[b.bucket] || "hsl(var(--primary))" }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold">{report.import.name}</h2>
        <p className="text-xs text-muted-foreground">{report.import.source_file_name} · processado em {fmtDate(report.import.created_at)}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard title="Leads recebidos" value={k.total} icon={<Users className="h-5 w-5" />} />
        <MetricCard title="Abordados" value={k.contacted} subtitle={pct(k.contacted_pct)} icon={<MessageCircle className="h-5 w-5" />} />
        <MetricCard title="Responderam" value={k.replied} subtitle={pct(k.replied_pct)} icon={<Reply className="h-5 w-5" />} />
        <MetricCard title="Pagantes" value={k.paying} subtitle={pct(k.paying_pct)} icon={<DollarSign className="h-5 w-5" />} />
        <MetricCard title="MRR · SLA médio" value={brl(k.mrr_total)} subtitle={k.avg_sla_hours != null ? `${k.avg_sla_hours.toFixed(1)}h` : "—"} icon={<Clock className="h-5 w-5" />} />
      </div>

      {/* Funil */}
      <Card>
        <CardHeader><CardTitle>Funil</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-2">
            <FunnelStep label="Recebidos" value={k.total} sub="100%" tone="primary" />
            <Arrow />
            <FunnelStep label="Abordados" value={k.contacted} sub={pct(k.contacted_pct)} tone="success" />
            <Arrow />
            <FunnelStep label="Responderam" value={k.replied} sub={pct(k.replied_pct)} tone="warning" />
            <Arrow />
            <FunnelStep label="Pagantes" value={k.paying} sub={pct(k.paying_pct)} tone="secondary" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Distribuição por SLA</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={slaChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="bucket" /><YAxis /><Tooltip />
                  <Bar dataKey="count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Série temporal</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={report.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" /><YAxis /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="received" name="Recebidos" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="contacted" name="Abordados" stroke="hsl(var(--success))" strokeWidth={2} />
                  <Line type="monotone" dataKey="replied" name="Responderam" stroke="hsl(var(--warning))" strokeWidth={2} />
                  <Line type="monotone" dataKey="paying" name="Pagantes" stroke="hsl(var(--secondary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      <Card>
        <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={bdTab} onValueChange={setBdTab}>
            <TabsList>
              <TabsTrigger value="agent">Por consultor (1º atendente)</TabsTrigger>
              <TabsTrigger value="origin">Por origem</TabsTrigger>
              <TabsTrigger value="campaign">Por campanha</TabsTrigger>
            </TabsList>
            <TabsContent value="agent"><BreakdownTable rows={report.by_agent} /></TabsContent>
            <TabsContent value="origin"><BreakdownTable rows={report.by_origin} /></TabsContent>
            <TabsContent value="campaign"><BreakdownTable rows={report.by_campaign} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Detalhada */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Leads detalhados ({filteredRows.length})</CardTitle>
            <div className="flex gap-2">
              <Select value={filter} onValueChange={(v: any) => { setFilter(v); setPage(0); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="matched">Com match</SelectItem>
                  <SelectItem value="unmatched">Sem match</SelectItem>
                  <SelectItem value="paying">Pagantes</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Buscar..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="w-52" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead>1º contato</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Conv</TableHead>
                  <TableHead>Respondeu?</TableHead>
                  <TableHead>Pagou?</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Tabulação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{r.lead_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.lead_email || r.lead_phone_raw || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">{r.lead_origin || "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.lead_created_at)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.cw_first_contact_at)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.sla_bucket || "—"}</Badge></TableCell>
                    <TableCell className="text-xs">{r.cw_first_agent_name || r.cw_first_agent_email || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.cw_total_conversations > 0 ? (
                        <a href={`${CW_BASE}/app/accounts/${CW_ACCOUNT}/conversations/${r.cw_conversation_ids[0]}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {r.cw_total_conversations} ↗
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{r.cw_customer_replied ? "✓" : "—"}</TableCell>
                    <TableCell>{r.stripe_paying ? "✓" : "—"}</TableCell>
                    <TableCell className="text-xs">{r.stripe_mrr ? brl(r.stripe_mrr) : "—"}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">{r.cw_last_label || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm mt-3">
            <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownTable({ rows }: { rows: { key: string; leads: number; contacted: number; replied: number; paying: number; mrr: number }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sem dados.</p>;
  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Abordados</TableHead>
            <TableHead className="text-right">% Resposta</TableHead>
            <TableHead className="text-right">Pagantes</TableHead>
            <TableHead className="text-right">% Conv</TableHead>
            <TableHead className="text-right">MRR</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right">{r.leads}</TableCell>
              <TableCell className="text-right">{r.contacted}</TableCell>
              <TableCell className="text-right">{r.contacted ? pct((r.replied / r.contacted) * 100) : "—"}</TableCell>
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
function Arrow() { return <ArrowRight className="hidden md:block mx-auto text-muted-foreground" />; }
