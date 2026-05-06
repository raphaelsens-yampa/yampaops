import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import {
  BarChart3, Download, ExternalLink, MessageCircle, Loader2, Search, ChevronDown,
  ChevronRight, ImageDown, FileText,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function downloadChartPng(container: HTMLElement | null, filename: string) {
  if (!container) return;
  const svg = container.querySelector("svg");
  if (!svg) return;
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  const bbox = svg.getBoundingClientRect();
  const w = Math.ceil(bbox.width), h = Math.ceil(bbox.height);
  cloned.setAttribute("width", String(w));
  cloned.setAttribute("height", String(h));
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const css = `<style>text{fill:#222;font-family:Manrope,Arial,sans-serif;}</style>`;
  cloned.insertAdjacentHTML("afterbegin", css);
  const xml = new XMLSerializer().serializeToString(cloned);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = url;
}

type Conv = {
  chatwoot_conversation_id: number;
  chatwoot_account_id: number;
  status: string;
  tabulacao_atendimento: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  opened_at: string | null;
  conversation_closed_at: string | null;
  first_response_at: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  team_name: string | null;
  inbox_name: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
};

const PAGE_SIZE = 25;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function diffMinutes(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.max(0, (db - da) / 60000);
}

function fmtDuration(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ChatwootReports() {
  const { role } = useAuth();
  if (role !== "admin" && role !== "tatico") return <Navigate to="/" replace />;

  const today = new Date();
  const past30 = new Date();
  past30.setDate(past30.getDate() - 30);

  const [from, setFrom] = useState<string>(isoDate(past30));
  const [to, setTo] = useState<string>(isoDate(today));
  const [status, setStatus] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");
  const [tabulacaoSel, setTabulacaoSel] = useState<string[]>([]); // [] = todas
  const [inbox, setInbox] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [showReport, setShowReport] = useState(false);
  const refTab = useRef<HTMLDivElement>(null);
  const refAgent = useRef<HTMLDivElement>(null);
  const refTeam = useRef<HTMLDivElement>(null);
  const refDay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("integration_settings")
      .select("chatwoot_base_url")
      .maybeSingle()
      .then(({ data }) => setBaseUrl(data?.chatwoot_base_url || ""));
  }, []);

  async function load() {
    setLoading(true);
    const PAGE_SIZE = 1000;
    const all: Conv[] = [];
    let offset = 0;
    while (true) {
      let q = supabase
        .from("chatwoot_conversations")
        .select(
          "chatwoot_conversation_id,chatwoot_account_id,status,tabulacao_atendimento,contact_name,contact_email,contact_phone,opened_at,conversation_closed_at,first_response_at,assignee_name,assignee_email,team_name,inbox_name,contact_id,opportunity_id",
        )
        .order("opened_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (from) q = q.gte("opened_at", `${from}T00:00:00`);
      if (to) q = q.lte("opened_at", `${to}T23:59:59`);
      if (status !== "all") q = q.eq("status", status);
      // Agente, Time e Tabulação são filtrados client-side para preservar as listas de opções

      const { data, error } = await q;
      if (error || !data) break;
      all.push(...(data as Conv[]));
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    setRows(all);
    setPage(0);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, status]);

  // Distinct lists for filter dropdowns
  const [agents, teams, tabs, inboxes] = useMemo(() => {
    const a = new Set<string>(), t = new Set<string>(), tb = new Set<string>(), ib = new Set<string>();
    rows.forEach((r) => {
      if (r.assignee_name) a.add(r.assignee_name);
      if (r.team_name) t.add(r.team_name);
      if (r.tabulacao_atendimento) tb.add(r.tabulacao_atendimento);
      if (r.inbox_name) ib.add(r.inbox_name);
    });
    return [Array.from(a).sort(), Array.from(t).sort(), Array.from(tb).sort(), Array.from(ib).sort()];
  }, [rows]);

  // Search + tabulação filter (client-side)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const tabSet = new Set(tabulacaoSel);
    const tabActive = tabulacaoSel.length > 0;
    return rows.filter((r) => {
      if (tabActive) {
        const key = r.tabulacao_atendimento || "__empty__";
        if (!tabSet.has(key)) return false;
      }
      if (agent !== "all" && (r.assignee_name || "") !== agent) return false;
      if (team !== "all" && (r.team_name || "") !== team) return false;
      if (inbox !== "all" && (r.inbox_name || "") !== inbox) return false;
      if (!s) return true;
      return (
        (r.contact_name || "").toLowerCase().includes(s) ||
        (r.contact_email || "").toLowerCase().includes(s) ||
        (r.contact_phone || "").toLowerCase().includes(s) ||
        String(r.chatwoot_conversation_id).includes(s)
      );
    });
  }, [rows, search, tabulacaoSel, agent, team, inbox]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const resolved = filtered.filter((r) => r.status === "resolved").length;
    const withTab = filtered.filter((r) => !!r.tabulacao_atendimento).length;
    // TMA = duração média do atendimento (abertura → fechamento, considera apenas resolvidos)
    const tmaList = filtered
      .map((r) => diffMinutes(r.opened_at, r.conversation_closed_at))
      .filter((v): v is number => v != null);
    const tma = tmaList.length ? tmaList.reduce((a, b) => a + b, 0) / tmaList.length : null;
    // TM1R = tempo médio de 1ª resposta (abertura → primeira resposta do agente)
    const t1rList = filtered
      .map((r) => diffMinutes(r.opened_at, r.first_response_at))
      .filter((v): v is number => v != null);
    const tm1r = t1rList.length ? t1rList.reduce((a, b) => a + b, 0) / t1rList.length : null;
    return {
      total,
      resolvedPct: total ? (resolved / total) * 100 : 0,
      tabPct: total ? (withTab / total) * 100 : 0,
      tma,
      tm1r,
    };
  }, [filtered]);

  // Charts
  const byTab = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const k = r.tabulacao_atendimento || "(sem tabulação)";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [filtered]);

  const byAgent = useMemo(() => {
    const map = new Map<string, { name: string; open: number; resolved: number; pending: number }>();
    filtered.forEach((r) => {
      const k = r.assignee_name || "(sem agente)";
      const cur = map.get(k) || { name: k, open: 0, resolved: 0, pending: 0 };
      if (r.status === "resolved") cur.resolved++;
      else if (r.status === "pending") cur.pending++;
      else cur.open++;
      map.set(k, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => (b.open + b.resolved + b.pending) - (a.open + a.resolved + a.pending))
      .slice(0, 12);
  }, [filtered]);

  const byTeam = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const k = r.team_name || "(sem time)";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; abertos: number; fechados: number }>();
    filtered.forEach((r) => {
      if (r.opened_at) {
        const d = r.opened_at.slice(0, 10);
        const cur = map.get(d) || { date: d, abertos: 0, fechados: 0 };
        cur.abertos++;
        map.set(d, cur);
      }
      if (r.conversation_closed_at) {
        const d = r.conversation_closed_at.slice(0, 10);
        const cur = map.get(d) || { date: d, abertos: 0, fechados: 0 };
        cur.fechados++;
        map.set(d, cur);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // Pagination
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function ticketUrl(r: Conv) {
    if (!baseUrl || !r.chatwoot_account_id) return null;
    return `${baseUrl.replace(/\/$/, "")}/app/accounts/${r.chatwoot_account_id}/conversations/${r.chatwoot_conversation_id}`;
  }

  function exportCsv() {
    const header = [
      "Cliente", "Email", "Telefone", "Ticket", "Caixa de Entrada", "Aberto em", "Fechado em",
      "1ª Resposta", "Agente", "Time", "Tabulação", "Status", "TMA", "TM1R",
    ];
    const lines = filtered.map((r) => {
      const tma = fmtDuration(diffMinutes(r.opened_at, r.conversation_closed_at));
      const tm1r = fmtDuration(diffMinutes(r.opened_at, r.first_response_at));
      return [
        r.contact_name, r.contact_email, r.contact_phone,
        r.chatwoot_conversation_id, r.inbox_name,
        fmtDateTime(r.opened_at), fmtDateTime(r.conversation_closed_at),
        fmtDateTime(r.first_response_at),
        r.assignee_name, r.team_name, r.tabulacao_atendimento,
        r.status, tma, tm1r,
      ].map((v) => {
        const s = (v ?? "").toString().replace(/"/g, '""');
        return /[",;\n]/.test(s) ? `"${s}"` : s;
      }).join(";");
    });
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atendimentos_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Cabeçalho
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Atendimentos", 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Período: ${from} até ${to}`, 40, 58);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 40, 72);

    // KPIs
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Indicadores", 40, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const kpiLines = [
      `Total de atendimentos: ${kpis.total.toLocaleString("pt-BR")}`,
      `Taxa de resolução: ${kpis.resolvedPct.toFixed(1)}%`,
      `Com tabulação: ${kpis.tabPct.toFixed(1)}%`,
      `TMA (Tempo Médio de Atendimento): ${fmtDuration(kpis.tma)}`,
      `TM1R (Tempo Médio de 1ª Resposta): ${fmtDuration(kpis.tm1r)}`,
    ];
    kpiLines.forEach((l, i) => doc.text(l, 40, 118 + i * 14));

    // Tabela
    autoTable(doc, {
      startY: 200,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [1, 184, 224] },
      head: [[
        "Cliente", "Email", "Telefone", "Ticket", "Caixa de Entrada",
        "Aberto em", "Fechado em", "1ª Resposta", "Agente", "Time",
        "Tabulação", "Status", "TMA", "TM1R",
      ]],
      body: filtered.map((r) => [
        r.contact_name || "—",
        r.contact_email || "—",
        r.contact_phone || "—",
        `#${r.chatwoot_conversation_id}`,
        r.inbox_name || "—",
        fmtDateTime(r.opened_at),
        fmtDateTime(r.conversation_closed_at),
        fmtDateTime(r.first_response_at),
        r.assignee_name || "—",
        r.team_name || "—",
        r.tabulacao_atendimento || "—",
        r.status,
        fmtDuration(diffMinutes(r.opened_at, r.conversation_closed_at)),
        fmtDuration(diffMinutes(r.opened_at, r.first_response_at)),
      ]),
      didDrawPage: () => {
        const pageNum = doc.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.text(`Página ${pageNum}`, pageW - 60, doc.internal.pageSize.getHeight() - 20);
      },
    });

    doc.save(`atendimentos_${from}_${to}.pdf`);
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold">Atendimentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Dashboard e relatório de tabulação dos atendimentos do Chatwoot
            </p>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="resolved">Resolvido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Agente</Label>
                <Select value={agent} onValueChange={setAgent}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Time</Label>
                <Select value={team} onValueChange={setTeam}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tabulação</Label>
                <TabulacaoFilter
                  options={tabs}
                  selected={tabulacaoSel}
                  onChange={setTabulacaoSel}
                />
              </div>
              <div>
                <Label className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    placeholder="nome, email, ticket..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end mt-3 gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Total de atendimentos" value={kpis.total.toLocaleString("pt-BR")} />
          <KpiCard title="Taxa de resolução" value={`${kpis.resolvedPct.toFixed(1)}%`} />
          <KpiCard title="TMR (médio)" value={fmtDuration(kpis.avgMin)} />
          <KpiCard title="Com tabulação" value={`${kpis.tabPct.toFixed(1)}%`} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Por Tabulação" containerRef={refTab} filename="por-tabulacao.png">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTab} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Por Agente" containerRef={refAgent} filename="por-agente.png">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAgent}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="open" stackId="a" name="Aberto" fill="hsl(var(--primary))" />
                <Bar dataKey="pending" stackId="a" name="Pendente" fill="hsl(var(--muted-foreground))" />
                <Bar dataKey="resolved" stackId="a" name="Resolvido" fill="hsl(var(--secondary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Por Time" containerRef={refTeam} filename="por-time.png" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTeam}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--secondary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Volume diário" containerRef={refDay} filename="volume-diario.png" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="abertos" name="Abertos" stroke="hsl(var(--primary))" />
                <Line type="monotone" dataKey="fechados" name="Fechados" stroke="hsl(var(--secondary))" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowReport((v) => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <CardTitle className="text-base flex items-center gap-2">
                {showReport ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <BarChart3 className="h-4 w-4" />
                Relatório ({filtered.length.toLocaleString("pt-BR")})
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {showReport ? "Ocultar" : "Expandir"}
              </span>
            </button>
          </CardHeader>
          {showReport && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Aberto em</TableHead>
                    <TableHead>Fechado em</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Tabulação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Nenhum atendimento encontrado para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                  {pageRows.map((r) => {
                    const url = ticketUrl(r);
                    return (
                      <TableRow key={r.chatwoot_conversation_id}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            <span>{r.contact_name || "—"}</span>
                            {r.opportunity_id && <Badge variant="outline" className="text-[10px] h-4 px-1">deal</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{r.contact_email || "—"}</TableCell>
                        <TableCell className="text-xs">{r.contact_phone || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              #{r.chatwoot_conversation_id} <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : `#${r.chatwoot_conversation_id}`}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDateTime(r.opened_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDateTime(r.conversation_closed_at)}</TableCell>
                        <TableCell className="text-xs">{r.assignee_name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.team_name || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.tabulacao_atendimento ? (
                            <Badge variant="secondary" className="text-[10px]">{r.tabulacao_atendimento}</Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between pt-3">
                <span className="text-xs text-muted-foreground">
                  Página {page + 1} de {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </CardContent>
          )}
        </Card>
      </div>
    </Layout>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="font-heading text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function TabulacaoFilter({
  options, selected, onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const allOptions = useMemo(() => ["__empty__", ...options], [options]);

  function label() {
    if (selected.length === 0) return "Todas";
    if (selected.length === 1) {
      const v = selected[0];
      return v === "__empty__" ? "(sem tabulação)" : v;
    }
    return `${selected.length} selecionadas`;
  }

  function toggle(value: string, e: React.MouseEvent) {
    const idx = allOptions.indexOf(value);
    // Shift+click = range
    if (e.shiftKey && anchor != null && idx >= 0) {
      const [a, b] = [anchor, idx].sort((x, y) => x - y);
      const range = allOptions.slice(a, b + 1);
      const set = new Set(selected);
      const allIn = range.every((v) => set.has(v));
      if (allIn) range.forEach((v) => set.delete(v));
      else range.forEach((v) => set.add(v));
      onChange(Array.from(set));
      return;
    }
    setAnchor(idx);
    const set = new Set(selected);
    if (set.has(value)) set.delete(value); else set.add(value);
    onChange(Array.from(set));
  }

  function selectAll() { onChange([]); }
  function selectNone() { onChange(allOptions.slice()); /* none = nada bate; usuário pode limpar */ }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal h-10">
          <span className="truncate text-sm">{label()}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-medium">Tabulações</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={selectAll}
            >
              Todas
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => onChange([])}
            >
              Limpar
            </button>
          </div>
        </div>
        <ScrollArea className="h-[280px]">
          <div className="p-1">
            {allOptions.length === 0 && (
              <div className="text-xs text-muted-foreground p-3 text-center">
                Sem opções disponíveis
              </div>
            )}
            {allOptions.map((opt) => {
              const checked = selected.includes(opt);
              const display = opt === "__empty__" ? "(sem tabulação)" : opt;
              return (
                <div
                  key={opt}
                  onClick={(e) => toggle(opt, e)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm select-none"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="truncate">{display}</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <div className="px-3 py-2 border-t text-[10px] text-muted-foreground">
          Dica: segure <kbd className="px-1 bg-muted rounded">Shift</kbd> e clique para selecionar um intervalo
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ChartCard({
  title, children, containerRef, filename, height = 280,
}: {
  title: string;
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
  filename: string;
  height?: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => downloadChartPng(containerRef.current, filename)}
          title="Baixar como PNG"
        >
          <ImageDown className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent style={{ height }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
