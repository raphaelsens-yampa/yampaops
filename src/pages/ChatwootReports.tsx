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
  ChevronRight, ImageDown, FileText, CalendarIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
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

  const bbox = svg.getBoundingClientRect();
  const w = Math.ceil(bbox.width) || svg.clientWidth || 800;
  const h = Math.ceil(bbox.height) || svg.clientHeight || 400;

  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute("width", String(w));
  cloned.setAttribute("height", String(h));
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!cloned.getAttribute("viewBox")) {
    cloned.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  // Recharts pinta com `fill="hsl(var(--primary))"` etc. Quando o SVG é
  // serializado fora do DOM, as CSS variables não existem e o navegador
  // pinta tudo como preto/transparente — o que deixa o PNG em branco.
  // Solução: copiar os estilos computados de cada nó original para o clone.
  const PROPS = [
    "fill", "fill-opacity",
    "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
    "opacity", "color",
    "font-family", "font-size", "font-weight", "text-anchor",
  ];
  const origNodes = svg.querySelectorAll<SVGElement>("*");
  const cloneNodes = cloned.querySelectorAll<SVGElement>("*");
  origNodes.forEach((node, i) => {
    const target = cloneNodes[i];
    if (!target) return;
    const cs = window.getComputedStyle(node);
    let style = "";
    for (const prop of PROPS) {
      const value = cs.getPropertyValue(prop);
      if (value && value !== "none" && value !== "normal") {
        style += `${prop}:${value};`;
      }
    }
    if (style) {
      const existing = target.getAttribute("style") || "";
      target.setAttribute("style", style + existing);
    }
  });

  const xml = new XMLSerializer().serializeToString(cloned);
  const svg64 = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.onerror = (e) => console.error("Falha ao renderizar gráfico para PNG", e);
  img.src = svg64;
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
  first_contact_message_at: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  team_name: string | null;
  inbox_name: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  labels: string[] | null;
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
  const totalSec = Math.max(0, Math.round(mins * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Verifica se um timestamp cai em horário comercial: Seg–Sex, 09h–18h (America/Sao_Paulo)
const _bhFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour12: false,
  weekday: "short",
  hour: "2-digit",
});
function isBusinessHours(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const parts = _bhFmt.formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "NaN", 10);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(wd);
  return isWeekday && hour >= 9 && hour < 18;
}

function DateRangeFilter({
  from, to, setFrom, setTo,
}: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  // anchor = próximo clique inicia novo intervalo (data início)
  const [anchor, setAnchor] = useState<Date | null>(null);

  const selected: DateRange | undefined = anchor
    ? { from: anchor, to: undefined }
    : (from && to ? { from: parseISO(from), to: parseISO(to) } : undefined);

  return (
    <Popover onOpenChange={(open) => { if (open) setAnchor(null); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !from && !to && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {from && to ? (
            <>{format(parseISO(from), "dd/MM/yy", { locale: ptBR })} – {format(parseISO(to), "dd/MM/yy", { locale: ptBR })}</>
          ) : (
            <span>Selecione o período</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={from ? parseISO(from) : undefined}
          selected={selected}
          onDayClick={(day) => {
            if (!anchor) {
              // primeiro clique: define data início, limpa fim
              setAnchor(day);
              setFrom(isoDate(day));
              setTo("");
            } else {
              // segundo clique: define data fim (ordena se necessário)
              const start = anchor < day ? anchor : day;
              const end = anchor < day ? day : anchor;
              setFrom(isoDate(start));
              setTo(isoDate(end));
              setAnchor(null);
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
  const [labelsSel, setLabelsSel] = useState<string[]>([]); // [] = todas
  const [inbox, setInbox] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);

  const [rows, setRows] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [showReport, setShowReport] = useState(false);
  const refTab = useRef<HTMLDivElement>(null);
  const refAgent = useRef<HTMLDivElement>(null);
  const refTeam = useRef<HTMLDivElement>(null);
  const refDay = useRef<HTMLDivElement>(null);
  const refInbox = useRef<HTMLDivElement>(null);
  const refMsgSent = useRef<HTMLDivElement>(null);
  const refMsgReceived = useRef<HTMLDivElement>(null);

  const [msgByDay, setMsgByDay] = useState<{ date: string; enviadas: number; recebidas: number }[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

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
          "chatwoot_conversation_id,chatwoot_account_id,status,tabulacao_atendimento,contact_name,contact_email,contact_phone,opened_at,conversation_closed_at,first_response_at,first_contact_message_at,assignee_name,assignee_email,team_name,inbox_name,contact_id,opportunity_id,labels",
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
  const [agents, teams, tabs, inboxes, labelOptions] = useMemo(() => {
    const a = new Set<string>(), t = new Set<string>(), tb = new Set<string>(), ib = new Set<string>(), lb = new Set<string>();
    rows.forEach((r) => {
      if (r.assignee_name) a.add(r.assignee_name);
      if (r.team_name) t.add(r.team_name);
      if (r.tabulacao_atendimento) tb.add(r.tabulacao_atendimento);
      if (r.inbox_name) ib.add(r.inbox_name);
      (r.labels || []).forEach((l) => { if (l) lb.add(l); });
    });
    return [Array.from(a).sort(), Array.from(t).sort(), Array.from(tb).sort(), Array.from(ib).sort(), Array.from(lb).sort()];
  }, [rows]);

  // Search + tabulação filter (client-side)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const tabSet = new Set(tabulacaoSel);
    const tabActive = tabulacaoSel.length > 0;
    const labelSet = new Set(labelsSel);
    const labelActive = labelsSel.length > 0;
    return rows.filter((r) => {
      if (businessHoursOnly && !isBusinessHours(r.opened_at)) return false;
      if (tabActive) {
        const key = r.tabulacao_atendimento || "__empty__";
        if (!tabSet.has(key)) return false;
      }
      if (labelActive) {
        const ls = r.labels || [];
        if (ls.length === 0) {
          if (!labelSet.has("__empty__")) return false;
        } else {
          if (!ls.some((l) => labelSet.has(l))) return false;
        }
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
  }, [rows, search, tabulacaoSel, labelsSel, agent, team, inbox, businessHoursOnly]);

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
    // TM1R = diferença entre primeira mensagem do cliente e primeira resposta do agente
    const t1rList = filtered
      .map((r) => diffMinutes(r.first_contact_message_at, r.first_response_at))
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

  // Por Caixa de Entrada: contagem + TMA + TM1R
  const byInbox = useMemo(() => {
    const map = new Map<string, { name: string; total: number; tmaSum: number; tmaN: number; t1rSum: number; t1rN: number }>();
    filtered.forEach((r) => {
      const k = r.inbox_name || "(sem caixa)";
      const cur = map.get(k) || { name: k, total: 0, tmaSum: 0, tmaN: 0, t1rSum: 0, t1rN: 0 };
      cur.total++;
      const tma = diffMinutes(r.opened_at, r.conversation_closed_at);
      if (tma != null) { cur.tmaSum += tma; cur.tmaN++; }
      const t1r = diffMinutes(r.first_contact_message_at, r.first_response_at);
      if (t1r != null) { cur.t1rSum += t1r; cur.t1rN++; }
      map.set(k, cur);
    });
    return Array.from(map.values())
      .map((v) => ({
        name: v.name,
        total: v.total,
        tma: v.tmaN ? v.tmaSum / v.tmaN : null,
        tm1r: v.t1rN ? v.t1rSum / v.t1rN : null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Mensagens enviadas/recebidas por dia (conforme conversas filtradas)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!filtered.length) { setMsgByDay([]); return; }
      setMsgLoading(true);
      const ids = filtered.map((r) => r.chatwoot_conversation_id);
      const CHUNK = 300;
      const map = new Map<string, { date: string; enviadas: number; recebidas: number }>();
      try {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          let q = supabase
            .from("chatwoot_messages")
            .select("message_created_at,message_type,is_private")
            .in("chatwoot_conversation_id", slice)
            .eq("is_private", false)
            .in("message_type", [0, 1]);
          if (from) q = q.gte("message_created_at", `${from}T00:00:00`);
          if (to) q = q.lte("message_created_at", `${to}T23:59:59`);
          const { data, error } = await q;
          if (error) break;
          (data || []).forEach((m: any) => {
            if (businessHoursOnly && !isBusinessHours(m.message_created_at)) return;
            const d = String(m.message_created_at).slice(0, 10);
            const cur = map.get(d) || { date: d, enviadas: 0, recebidas: 0 };
            if (m.message_type === 1) cur.enviadas++;
            else if (m.message_type === 0) cur.recebidas++;
            map.set(d, cur);
          });
        }
        if (!cancelled) {
          setMsgByDay(Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)));
        }
      } finally {
        if (!cancelled) setMsgLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filtered, from, to, businessHoursOnly]);

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
      const tm1r = fmtDuration(diffMinutes(r.first_contact_message_at, r.first_response_at));
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
    a.download = `atendimentos_${from}_${to}${businessHoursOnly ? "_horario-comercial" : ""}.csv`;
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
    doc.text(`Período: ${from} até ${to}${businessHoursOnly ? "  •  Apenas horário comercial (Seg–Sex, 09h–18h)" : ""}`, 40, 58);
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
        fmtDuration(diffMinutes(r.first_contact_message_at, r.first_response_at)),
      ]),
      didDrawPage: () => {
        const pageNum = doc.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.text(`Página ${pageNum}`, pageW - 60, doc.internal.pageSize.getHeight() - 20);
      },
    });

    doc.save(`atendimentos_${from}_${to}${businessHoursOnly ? "_horario-comercial" : ""}.pdf`);
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold flex items-center gap-2">
              Atendimentos
              {businessHoursOnly && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  Horário comercial
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Dashboard e relatório de tabulação dos atendimentos do Chatwoot
            </p>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              <div>
                <Label className="text-xs">Período</Label>
                <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} />
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
                <Label className="text-xs">Caixa de Entrada</Label>
                <Select value={inbox} onValueChange={setInbox}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {inboxes.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
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
                <Label className="text-xs">Etiquetas</Label>
                <TabulacaoFilter
                  options={labelOptions}
                  selected={labelsSel}
                  onChange={setLabelsSel}
                  title="Etiquetas"
                  emptyLabel="(sem etiqueta)"
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
            <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm select-none">
                <Checkbox
                  id="business-hours-only"
                  checked={businessHoursOnly}
                  onCheckedChange={(v) => setBusinessHoursOnly(!!v)}
                />
                <Label htmlFor="business-hours-only" className="cursor-pointer font-normal">
                  Apenas horário comercial <span className="text-muted-foreground">(Seg–Sex, 09h–18h)</span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
                  <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={!filtered.length}>
                  <FileText className="h-4 w-4 mr-1.5" /> Exportar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard title="Total de atendimentos" value={kpis.total.toLocaleString("pt-BR")} />
          <KpiCard title="Taxa de resolução" value={`${kpis.resolvedPct.toFixed(1)}%`} />
          <KpiCard title="TMA (Tempo Médio de Atendimento)" value={fmtDuration(kpis.tma)} />
          <KpiCard title="TM1R (Tempo Médio de 1ª Resposta)" value={fmtDuration(kpis.tm1r)} />
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

        {/* Mensagens por dia */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title={`Mensagens enviadas por dia${msgLoading ? " (carregando...)" : ""}`}
            containerRef={refMsgSent}
            filename="mensagens-enviadas-por-dia.png"
            height={260}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={msgByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="enviadas" name="Enviadas" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title={`Mensagens recebidas por dia${msgLoading ? " (carregando...)" : ""}`}
            containerRef={refMsgReceived}
            filename="mensagens-recebidas-por-dia.png"
            height={260}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={msgByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="recebidas" name="Recebidas" fill="hsl(var(--secondary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>



        {/* Caixa de Entrada: gráfico + tabela TMA/TM1R lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Por Caixa de Entrada" containerRef={refInbox} filename="por-caixa-entrada.png" height={360}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byInbox} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Atendimentos" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">TMA e TM1R por Caixa de Entrada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[360px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Caixa de Entrada</TableHead>
                      <TableHead className="text-right text-xs">Atend.</TableHead>
                      <TableHead className="text-right text-xs">TMA</TableHead>
                      <TableHead className="text-right text-xs">TM1R</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byInbox.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                          Sem dados para o período selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                    {byInbox.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="text-xs py-2">{b.name}</TableCell>
                        <TableCell className="text-right text-xs py-2">{b.total.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right text-xs py-2">{fmtDuration(b.tma)}</TableCell>
                        <TableCell className="text-right text-xs py-2">{fmtDuration(b.tm1r)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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
                    <TableHead>Caixa de Entrada</TableHead>
                    <TableHead>Aberto em</TableHead>
                    <TableHead>Fechado em</TableHead>
                    <TableHead>1ª Resposta</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Tabulação</TableHead>
                    <TableHead>Etiquetas</TableHead>
                    <TableHead>TMA</TableHead>
                    <TableHead>TM1R</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-sm text-muted-foreground py-8">
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
                        <TableCell className="text-xs">{r.inbox_name || "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDateTime(r.opened_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDateTime(r.conversation_closed_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDateTime(r.first_response_at)}</TableCell>
                        <TableCell className="text-xs">{r.assignee_name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.team_name || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.tabulacao_atendimento ? (
                            <Badge variant="secondary" className="text-[10px]">{r.tabulacao_atendimento}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.labels && r.labels.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {r.labels.map((l) => (
                                <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>
                              ))}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{fmtDuration(diffMinutes(r.opened_at, r.conversation_closed_at))}</TableCell>
                        <TableCell className="text-xs">{fmtDuration(diffMinutes(r.first_contact_message_at, r.first_response_at))}</TableCell>
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
  options, selected, onChange, title = "Tabulações", emptyLabel = "(sem tabulação)",
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  title?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const allOptions = useMemo(() => ["__empty__", ...options], [options]);

  function label() {
    if (selected.length === 0 || selected.length === allOptions.length) return "Todas";
    if (selected.length === 1) {
      const v = selected[0];
      return v === "__empty__" ? emptyLabel : v;
    }
    return `${selected.length} selecionadas`;
  }

  function toggle(value: string, e: React.MouseEvent) {
    const idx = allOptions.indexOf(value);
    const base = selected.slice();

    // Shift+click = range
    if (e.shiftKey && anchor != null && idx >= 0) {
      const [a, b] = [anchor, idx].sort((x, y) => x - y);
      const range = allOptions.slice(a, b + 1);
      const set = new Set(base);
      const allIn = range.every((v) => set.has(v));
      if (allIn) range.forEach((v) => set.delete(v));
      else range.forEach((v) => set.add(v));
      onChange(Array.from(set));
      return;
    }
    setAnchor(idx);
    const set = new Set(base);
    if (set.has(value)) set.delete(value); else set.add(value);
    onChange(Array.from(set));
  }


  function selectAll() { onChange(allOptions.slice()); }
  function clearAll() { onChange([]); }

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
          <span className="text-xs font-medium">{title}</span>
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
              const display = opt === "__empty__" ? emptyLabel : opt;
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
