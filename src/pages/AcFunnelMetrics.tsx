import { useEffect, useMemo, useState } from "react";
import { AcOpportunityMetricConfig } from "@/components/goals/tactical/AcOpportunityMetricConfig";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Copy,
  ExternalLink,
  ArrowRight,
  TrendingUp,
  Trophy,
  XCircle,
  Clock,
  Download,
  History,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import * as XLSX from "xlsx";
import {
  computeConversionKpis,
  computeOwnerConversion,
  computeStageFlow,
  deltaPct,
  deltaPp,
  previousRange,
  type KpiEvent,
} from "@/lib/acFunnelKpis";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const WEBHOOK_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/ac-funnel-webhook`;
const AC_APP_BASE = (localStorage.getItem("ac_app_base_url") || "https://app.activecampaign.com").replace(/\/+$/, "");
const TZ = "America/Sao_Paulo";

type Funnel = {
  ac_group_id: string;
  title: string;
  is_connected: boolean;
  connected_at: string | null;
  last_sync_at: string | null;
  last_webhook_at: string | null;
  deals_count: number;
};

type Stage = { ac_stage_id: string; ac_group_id: string; title: string; position: number; color: string | null };

type Deal = {
  ac_deal_id: string;
  ac_group_id: string;
  ac_stage_id: string | null;
  title: string | null;
  contact_name: string | null;
  contact_email: string | null;
  owner_name: string | null;
  value: number;
  status: number;
  loss_reason: string | null;
  deal_created_at: string | null;
  stage_changed_at: string | null;
  closed_at: string | null;
};

type Task = {
  ac_task_id: string;
  ac_deal_id: string;
  ac_stage_id: string | null;
  title: string | null;
  task_type: string | null;
  owner_name: string | null;
  due_date: string | null;
  is_done: boolean;
  done_at: string | null;
};


type Event = {
  id: string;
  ac_deal_id: string;
  ac_group_id: string;
  event_type: string;
  from_stage_id: string;
  to_stage_id: string;
  deal_value: number;
  contact_email: string | null;
  owner_name: string | null;
  occurred_at: string;
};

function spDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
}
function spDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
function todaySp(): string {
  return spDate(new Date().toISOString());
}
function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
const STATUS_LABEL: Record<number, string> = { 0: "Aberto", 1: "Ganho", 2: "Perdido", 3: "Aberto" };

export default function AcFunnelMetrics() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [listing, setListing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [closuresBackfilling, setClosuresBackfilling] = useState(false);

  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number; events: number } | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [previousEvents, setPreviousEvents] = useState<Event[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  // Padrão: mês vigente, do dia 1 até hoje (fuso São Paulo)
  const [from, setFrom] = useState<string>(`${todaySp().slice(0, 7)}-01`);

  const [to, setTo] = useState<string>(todaySp());
  const [owner, setOwner] = useState<string>("__all__");
  const [taskDim, setTaskDim] = useState<"owner" | "stage" | "action">("owner");
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<any | null>(null);


  if (role !== "admin" && role !== "tatico") return <Navigate to="/" replace />;

  async function loadAll(selected?: string) {
    setLoading(true);
    const { data: f } = await supabase.from("ac_funnels").select("*").order("title");
    const list = (f ?? []) as Funnel[];
    setFunnels(list);
    const gid = selected || groupId || list.find((x) => x.is_connected)?.ac_group_id || "";
    setGroupId(gid);

    if (gid) {
      const [s, d, e, pe, t] = await Promise.all([
        supabase.from("ac_funnel_stages").select("*").eq("ac_group_id", gid).order("position"),
        supabase.from("ac_funnel_deals").select("*").eq("ac_group_id", gid).limit(5000),
        supabase
          .from("ac_funnel_stage_events")
          .select("*")
          .eq("ac_group_id", gid)
          .gte("occurred_at", `${from}T00:00:00-03:00`)
          .lte("occurred_at", `${to}T23:59:59-03:00`)
          .order("occurred_at", { ascending: false })
          .limit(20000),
        supabase
          .from("ac_funnel_stage_events")
          .select("*")
          .eq("ac_group_id", gid)
          .gte("occurred_at", `${previousRange(from, to).from}T00:00:00-03:00`)
          .lte("occurred_at", `${previousRange(from, to).to}T23:59:59-03:00`)
          .order("occurred_at", { ascending: false })
          .limit(20000),
        supabase.from("ac_funnel_deal_tasks").select("*").eq("ac_group_id", gid).limit(20000),
      ]);
      setStages((s.data ?? []) as Stage[]);
      setAllDeals((d.data ?? []) as Deal[]);
      setAllEvents((e.data ?? []) as Event[]);
      setPreviousEvents((pe.data ?? []) as Event[]);
      setAllTasks((t.data ?? []) as Task[]);
    } else {
      setStages([]);
      setAllDeals([]);
      setAllEvents([]);
      setPreviousEvents([]);
      setAllTasks([]);
    }
    setLoading(false);
  }


  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (groupId) loadAll(groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, from, to]);

  const stageMap = useMemo(() => {
    const m = new Map<string, Stage>();
    stages.forEach((s) => m.set(s.ac_stage_id, s));
    return m;
  }, [stages]);

  const stageName = (id: string | null) => (id ? stageMap.get(id)?.title ?? `Etapa ${id}` : "—");

  const owners = useMemo(() => {
    const set = new Set<string>();
    allDeals.forEach((d) => d.owner_name && set.add(d.owner_name));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allDeals]);

  const matchOwner = (name: string | null) => owner === "__all__" || (name ?? "—") === owner;

  const deals = useMemo(() => allDeals.filter((d) => matchOwner(d.owner_name)), [allDeals, owner]);
  const events = useMemo(() => allEvents.filter((e) => matchOwner(e.owner_name)), [allEvents, owner]);
  const tasks = useMemo(() => allTasks.filter((t) => matchOwner(t.owner_name)), [allTasks, owner]);

  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const day = spDate(iso);
    return day >= from && day <= to;
  };

  /** Ranking de ganhos por proprietário (negócios fechados como Ganho no período). */
  const wonRanking = useMemo(() => {
    const map = new Map<string, { owner: string; qtd: number; valor: number }>();
    deals
      .filter((d) => d.status === 1 && inPeriod(d.closed_at ?? d.stage_changed_at ?? d.deal_created_at))
      .forEach((d) => {
        const key = d.owner_name ?? "Sem proprietário";
        const row = map.get(key) ?? { owner: key, qtd: 0, valor: 0 };
        row.qtd++;
        row.valor += Number(d.value || 0);
        map.set(key, row);
      });
    const rows = Array.from(map.values()).sort((a, b) => b.valor - a.valor || b.qtd - a.qtd);
    return {
      rows,
      totalQtd: rows.reduce((a, r) => a + r.qtd, 0),
      totalValor: rows.reduce((a, r) => a + r.valor, 0),
    };
  }, [deals, from, to]);

  /** Ranking de motivos de perda (campo "Deal - Sales - Motivo de perda"). */
  const lossRanking = useMemo(() => {
    const lost = deals.filter((d) => d.status === 2 && inPeriod(d.closed_at ?? d.stage_changed_at ?? d.deal_created_at));
    const map = new Map<string, { reason: string; qtd: number; valor: number }>();
    lost.forEach((d) => {
      const key = (d.loss_reason ?? "").trim() || "Sem motivo informado";
      const row = map.get(key) ?? { reason: key, qtd: 0, valor: 0 };
      row.qtd++;
      row.valor += Number(d.value || 0);
      map.set(key, row);
    });
    const rows = Array.from(map.values()).sort((a, b) => b.qtd - a.qtd);
    return { rows, total: lost.length, totalValor: rows.reduce((a, r) => a + r.valor, 0) };
  }, [deals, from, to]);

  /** Visão de tarefas por proprietário / etapa / ação. */
  const taskMatrix = useMemo(() => {
    const today = todaySp();
    const openDeals = deals.filter((d) => d.status === 0 || d.status === 3);
    const dealById = new Map(deals.map((d) => [d.ac_deal_id, d]));
    const withTask = new Set(tasks.filter((t) => !t.is_done).map((t) => t.ac_deal_id));

    const keyOf = (dim: typeof taskDim, t: Task | null, d: Deal | null) => {
      if (dim === "owner") return (t?.owner_name ?? d?.owner_name) || "Sem proprietário";
      if (dim === "stage") return stageName((t?.ac_stage_id ?? d?.ac_stage_id) ?? null);
      return t?.task_type || "Sem ação definida";
    };

    const map = new Map<
      string,
      { key: string; proximas: number; agendadas: number; atrasadas: number; concluidas: number; semTarefa: number }
    >();
    const bump = (key: string) => {
      const row = map.get(key) ?? { key, proximas: 0, agendadas: 0, atrasadas: 0, concluidas: 0, semTarefa: 0 };
      map.set(key, row);
      return row;
    };

    tasks.forEach((t) => {
      const d = dealById.get(t.ac_deal_id) ?? null;
      if (!d) return;
      const row = bump(keyOf(taskDim, t, d));
      if (t.is_done) {
        if (inPeriod(t.done_at)) row.concluidas++;
        return;
      }
      row.agendadas++;
      const due = t.due_date ? spDate(t.due_date) : null;
      if (due && due < today) row.atrasadas++;
      else row.proximas++;
    });

    // Negócios abertos sem tarefa atribuída
    if (taskDim !== "action") {
      openDeals
        .filter((d) => !withTask.has(d.ac_deal_id))
        .forEach((d) => {
          bump(keyOf(taskDim, null, d)).semTarefa++;
        });
    }

    const rows = Array.from(map.values()).sort((a, b) => b.agendadas - a.agendadas || a.key.localeCompare(b.key, "pt-BR"));
    const totals = rows.reduce(
      (a, r) => ({
        proximas: a.proximas + r.proximas,
        agendadas: a.agendadas + r.agendadas,
        atrasadas: a.atrasadas + r.atrasadas,
        concluidas: a.concluidas + r.concluidas,
        semTarefa: a.semTarefa + r.semTarefa,
      }),
      { proximas: 0, agendadas: 0, atrasadas: 0, concluidas: 0, semTarefa: 0 },
    );
    return { rows, totals };
  }, [tasks, deals, taskDim, from, to, stageMap]);


  const kpiInput = useMemo(() => ({
    events: events as KpiEvent[],
    deals,
    stages,
  }), [events, deals, stages]);

  const conversionKpis = useMemo(
    () => computeConversionKpis(kpiInput.events, kpiInput.deals, kpiInput.stages),
    [kpiInput],
  );

  const previousConversionKpis = useMemo(
    () => computeConversionKpis(previousEvents as KpiEvent[], deals, stages),
    [previousEvents, deals, stages],
  );

  const stageFlow = useMemo(
    () => computeStageFlow(kpiInput.events, kpiInput.stages),
    [kpiInput],
  );

  const previousStageFlow = useMemo(
    () => computeStageFlow(previousEvents as KpiEvent[], stages),
    [previousEvents, stages],
  );

  const ownerConversion = useMemo(() => computeOwnerConversion(kpiInput.events), [kpiInput.events]);

  const kpis = useMemo(() => {
    const openNow = deals.filter((d) => d.status === 0 || d.status === 3);
    return {
      created: conversionKpis.created,
      moves: conversionKpis.moves,
      won: conversionKpis.won,
      lost: conversionKpis.lost,
      wonValue: conversionKpis.wonValue,
      openNow: openNow.length,
      openValue: openNow.reduce((a, d) => a + Number(d.value || 0), 0),
      convRate: conversionKpis.winRate ?? 0,
      avgAge: (() => {
        const now = Date.now();
        const ages = openNow
          .filter((d) => d.deal_created_at)
          .map((d) => (now - new Date(d.deal_created_at as string).getTime()) / 86400000);
        return ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
      })(),
    };
  }, [deals, conversionKpis]);

  const conversionDelta = useMemo(() => ({
    winRate: deltaPp(conversionKpis.winRate, previousConversionKpis.winRate),
    entryConversion: deltaPp(conversionKpis.entryConversion, previousConversionKpis.entryConversion),
    avgTicket: deltaPct(conversionKpis.avgTicket, previousConversionKpis.avgTicket),
    cycleDays: deltaPct(conversionKpis.cycleDays, previousConversionKpis.cycleDays),
    advanceRate: deltaPp(conversionKpis.advanceRate, previousConversionKpis.advanceRate),
  }), [conversionKpis, previousConversionKpis]);

  const stageSnapshot = useMemo(() => {
    return stages.map((s) => {
      const inStage = deals.filter((d) => d.ac_stage_id === s.ac_stage_id && (d.status === 0 || d.status === 3));
      return {
        stage: s.title,
        qtd: inStage.length,
        valor: inStage.reduce((a, d) => a + Number(d.value || 0), 0),
      };
    });
  }, [stages, deals]);

  const matrix = useMemo(() => {
    const moves = events.filter((e) => e.event_type === "stage_change");
    const counts = new Map<string, number>();
    moves.forEach((e) => {
      const key = `${e.from_stage_id}>${e.to_stage_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return { counts, moves };
  }, [events]);

  const dailySeries = useMemo(() => {
    const map = new Map<string, { day: string; entradas: number; movimentacoes: number; ganhos: number; perdas: number; winRateAcumulado: number | null }>();
    let cursor = from;
    while (cursor <= to) {
      map.set(cursor, { day: cursor, entradas: 0, movimentacoes: 0, ganhos: 0, perdas: 0, winRateAcumulado: null });
      cursor = addDays(cursor, 1);
    }
    events.forEach((e) => {
      const day = spDate(e.occurred_at);
      const row = map.get(day);
      if (!row) return;
      if (e.event_type === "created") row.entradas++;
      else if (e.event_type === "stage_change") row.movimentacoes++;
      else if (e.event_type === "won") row.ganhos++;
      else if (e.event_type === "lost") row.perdas++;
    });
    let accumulatedWon = 0;
    let accumulatedLost = 0;
    return Array.from(map.values()).map((r) => {
      accumulatedWon += r.ganhos;
      accumulatedLost += r.perdas;
      return {
        ...r,
        winRateAcumulado: accumulatedWon + accumulatedLost
          ? (accumulatedWon / (accumulatedWon + accumulatedLost)) * 100
          : null,
        label: r.day.slice(5).split("-").reverse().join("/"),
      };
    });
  }, [events, from, to]);

  const dealsInPeriod = useMemo(() => {
    const ids = new Set(events.map((e) => e.ac_deal_id));
    return deals
      .filter((d) => ids.has(d.ac_deal_id))
      .sort((a, b) => (b.deal_created_at ?? "").localeCompare(a.deal_created_at ?? ""));
  }, [deals, events]);

  /** Auditoria somente leitura: compara etapa por etapa com o ActiveCampaign. */
  async function runAudit() {
    setAuditing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-funnel-sync", {
        body: { action: "audit_stages", groupId },
      });
      if (error) throw error;
      setAudit(data?.audit ?? null);
      const a = data?.audit;
      if (a && !a.missing_in_db && !a.extra_in_db && !a.divergent) toast.success("Snapshot idêntico ao ActiveCampaign");
      else toast.warning(`Divergências encontradas: ${a?.missing_in_db ?? 0} faltando, ${a?.extra_in_db ?? 0} sobrando, ${a?.divergent ?? 0} diferentes`);
    } catch (e: any) {
      toast.error(`Falha na auditoria: ${e?.message ?? e}`);
    } finally {
      setAuditing(false);
    }
  }

  async function runSync() {

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-funnel-sync", {
        body: { action: "sync", groupId: groupId || undefined },
      });
      if (error) throw error;
      const r = (data?.results ?? [])[0];
      toast.success(r ? `Sync concluído: ${r.deals} negócios, ${r.events} eventos novos` : "Sync concluído");
      await loadAll(groupId);
    } catch (e: any) {
      toast.error(`Falha no sync: ${e?.message ?? e}`);
    } finally {
      setSyncing(false);
    }
  }

  async function runBackfill() {
    setBackfilling(true);
    setBackfillProgress({ done: 0, total: 0, events: 0 });
    try {
      let startIndex = 0;
      let events = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.functions.invoke("ac-funnel-sync", {
          body: { action: "backfill_activities", groupId, days: 365, startIndex, batchSize: 100 },
        });
        if (error) throw error;
        events += Number(data?.written ?? 0);
        startIndex = Number(data?.next_index ?? startIndex);
        setBackfillProgress({ done: startIndex, total: Number(data?.total_deals ?? 0), events });
        if (data?.done) break;
      }
      toast.success(`Histórico importado: ${events} eventos`);
      await loadAll(groupId);
    } catch (e: any) {
      toast.error(`Falha no backfill: ${e?.message ?? e}`);
    } finally {
      setBackfilling(false);
    }
  }

  /** Reconstrói Ganhos/Perdidos do período filtrado a partir do snapshot de negócios. */
  async function runClosuresBackfill() {
    setClosuresBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-funnel-sync", {
        body: { action: "backfill_closures", groupId, from, to },
      });
      if (error) throw error;
      toast.success(`Fechamentos registrados: ${data?.won ?? 0} ganhos e ${data?.lost ?? 0} perdidos`);
      await loadAll(groupId);
    } catch (e: any) {
      toast.error(`Falha ao registrar fechamentos: ${e?.message ?? e}`);
    } finally {
      setClosuresBackfilling(false);
    }
  }


  async function listFunnels() {
    setListing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-funnel-sync", { body: { action: "list_funnels" } });
      if (error) throw error;
      toast.success(`${data?.funnels?.length ?? 0} funis encontrados no ActiveCampaign`);
      await loadAll(groupId);
    } catch (e: any) {
      toast.error(`Falha ao listar funis: ${e?.message ?? e}`);
    } finally {
      setListing(false);
    }
  }

  async function toggleFunnel(f: Funnel, connected: boolean) {
    try {
      const { error } = await supabase.functions.invoke("ac-funnel-sync", {
        body: { action: "connect", groupId: f.ac_group_id, title: f.title, connected },
      });
      if (error) throw error;
      toast.success(connected ? `Funil "${f.title}" conectado e sincronizado` : `Funil "${f.title}" desconectado`);
      await loadAll(connected ? f.ac_group_id : groupId);
    } catch (e: any) {
      toast.error(`Falha: ${e?.message ?? e}`);
    }
  }

  function exportDeals(format: "csv" | "xlsx") {
    const rows = dealsInPeriod.map((d) => ({
      Negócio: d.title ?? "",
      Contato: d.contact_name ?? "",
      Email: d.contact_email ?? "",
      Responsável: d.owner_name ?? "",
      Etapa: stageName(d.ac_stage_id),
      Status: STATUS_LABEL[d.status] ?? String(d.status),
      Valor: Number(d.value || 0),
      "Criado em": spDateTime(d.deal_created_at),
      "Última movimentação": spDateTime(d.stage_changed_at),
      Link: `${AC_APP_BASE}/app/deals/${d.ac_deal_id}`,
    }));
    if (!rows.length) return toast.error("Nada para exportar no período");
    const ws = XLSX.utils.json_to_sheet(rows);
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `funil-ac-${groupId}-${from}_${to}.csv`;
      a.click();
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Negócios");
      XLSX.writeFile(wb, `funil-ac-${groupId}-${from}_${to}.xlsx`);
    }
  }

  const connected = funnels.filter((f) => f.is_connected);
  const current = funnels.find((f) => f.ac_group_id === groupId) ?? null;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Funis ActiveCampaign</h1>
            <p className="text-sm text-muted-foreground">
              Métricas de funil somente leitura: aberturas, movimentações entre etapas e fechamentos.
            </p>
            <p className="text-xs text-muted-foreground">
              Última sincronização: {spDateTime(current?.last_sync_at)}
            </p>

          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={runBackfill} disabled={backfilling || !groupId} className="w-full sm:w-auto">
              {backfilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
              {backfilling && backfillProgress
                ? `Histórico ${backfillProgress.done}/${backfillProgress.total}`
                : "Importar histórico (12m)"}
            </Button>
            <Button
              variant="outline"
              onClick={runClosuresBackfill}
              disabled={closuresBackfilling || !groupId}
              className="w-full sm:w-auto"
              title="Registra Ganhos/Perdidos do período filtrado a partir dos negócios sincronizados"
            >
              {closuresBackfilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
              Registrar fechamentos do período
            </Button>

            <Button onClick={runSync} disabled={syncing || !groupId} className="w-full sm:w-auto">
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Sincronizar agora
            </Button>
          </div>
        </div>

        <Tabs defaultValue="metricas">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="metricas" className="flex-1 sm:flex-none">Métricas</TabsTrigger>
            <TabsTrigger value="conexao" className="flex-1 sm:flex-none">Conexão</TabsTrigger>
          </TabsList>

          {/* ---------------- MÉTRICAS ---------------- */}
          <TabsContent value="metricas" className="space-y-6">
            <Card>
              <CardContent className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label>Funil</Label>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
                    <SelectContent>
                      {connected.map((f) => (
                        <SelectItem key={f.ac_group_id} value={f.ac_group_id}>{f.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Proprietário</Label>
                  <Select value={owner} onValueChange={setOwner}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {owners.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>De</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Até</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setFrom(`${todaySp().slice(0, 7)}-01`); setTo(todaySp()); }}
                  >
                    Mês atual
                  </Button>
                  {[
                    { l: "7d", d: 6 },
                    { l: "30d", d: 29 },
                    { l: "90d", d: 89 },
                  ].map((p) => (
                    <Button
                      key={p.l}
                      variant="outline"
                      size="sm"
                      onClick={() => { setFrom(addDays(todaySp(), -p.d)); setTo(todaySp()); }}
                    >
                      {p.l}
                    </Button>
                  ))}
                </div>

              </CardContent>
            </Card>

            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : !groupId ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Conecte um funil na aba <strong>Conexão</strong> para ver as métricas.
              </CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <KpiCard icon={<Trophy className="h-4 w-4" />} label="Win rate" value={formatPercent(conversionKpis.winRate)} hint={formatDelta(conversionDelta.winRate, "p.p.")} />
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Conversão de entrada" value={formatPercent(conversionKpis.entryConversion)} hint={formatDelta(conversionDelta.entryConversion, "p.p.")} />
                  <KpiCard icon={<ArrowRight className="h-4 w-4" />} label="Taxa de avanço" value={formatPercent(conversionKpis.advanceRate)} hint={formatDelta(conversionDelta.advanceRate, "p.p.")} />
                  <KpiCard icon={<Trophy className="h-4 w-4" />} label="Ticket médio ganho" value={formatCurrency(conversionKpis.avgTicket)} hint={formatDelta(conversionDelta.avgTicket)} />
                  <KpiCard icon={<Clock className="h-4 w-4" />} label="Ciclo médio de fechamento" value={formatDays(conversionKpis.cycleDays)} hint={formatDelta(conversionDelta.cycleDays)} />
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Negócios abertos no período" value={String(kpis.created)} hint={`${kpis.openNow} em aberto agora`} />
                  <KpiCard icon={<ArrowRight className="h-4 w-4" />} label="Movimentações" value={String(kpis.moves)} hint="mudanças de etapa" />
                  <KpiCard icon={<Trophy className="h-4 w-4" />} label="Ganhos" value={String(kpis.won)} hint={brl(kpis.wonValue)} />
                  <KpiCard icon={<XCircle className="h-4 w-4" />} label="Perdidos" value={String(kpis.lost)} hint={`Win rate ${formatPercent(conversionKpis.winRate)}`} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Conversão por etapa</CardTitle>
                    <CardDescription>Passagem, vazamento e permanência no período selecionado. A comparação é contra o período anterior do mesmo tamanho.</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Etapa</TableHead>
                          <TableHead className="text-right">Entradas</TableHead>
                          <TableHead className="text-right">Avanço</TableHead>
                          <TableHead className="text-right">Passagem</TableHead>
                          <TableHead className="text-right">Perda</TableHead>
                          <TableHead className="text-right">Acumulada</TableHead>
                          <TableHead className="text-right">Permanência</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stageFlow.map((row, index) => {
                          const previous = previousStageFlow[index];
                          return (
                            <TableRow key={row.stageId}>
                              <TableCell className="font-medium">{row.title}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.entries}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.advanced}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span>{formatPercent(row.passRate)}</span>
                                <SmallDelta value={deltaPp(row.passRate, previous?.passRate ?? null)} suffix=" p.p." />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span>{formatPercent(row.lossRate)}</span>
                                <SmallDelta value={deltaPp(row.lossRate, previous?.lossRate ?? null)} suffix=" p.p." />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatPercent(row.cumulative)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatDays(row.avgDays)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {!stageFlow.length && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Sem dados de movimentação no período</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Funil hoje (em aberto por etapa)</CardTitle>
                      <CardDescription>Quantidade e valor parados em cada etapa</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {stageSnapshot.map((s) => {
                        const max = Math.max(...stageSnapshot.map((x) => x.qtd), 1);
                        return (
                          <div key={s.stage} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="truncate">{s.stage}</span>
                              <span className="tabular-nums text-muted-foreground">{s.qtd} · {brl(s.valor)}</span>
                            </div>
                            <div className="h-2 rounded bg-muted">
                              <div className="h-2 rounded bg-primary" style={{ width: `${(s.qtd / max) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> Idade média dos abertos: {kpis.avgAge.toFixed(0)} dias · Valor em aberto: {brl(kpis.openValue)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Volume diário</CardTitle>
                      <CardDescription>Entradas, movimentações e fechamentos por dia</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailySeries}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="label" fontSize={11} />
                          <YAxis fontSize={11} allowDecimals={false} />
                          <RTooltip />
                          <Legend />
                          <Line type="monotone" dataKey="entradas" name="Entradas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="movimentacoes" name="Movimentações" stroke="hsl(var(--secondary))" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="ganhos" name="Ganhos" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="perdas" name="Perdas" stroke="hsl(0 72% 51%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="winRateAcumulado" name="Win rate acumulado (%)" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Movimentações de X para Y</CardTitle>
                    <CardDescription>Linhas = etapa de origem · Colunas = etapa de destino · {matrix.moves.length} movimentações no período</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[160px]">De ↓ / Para →</TableHead>
                          {stages.map((s) => (
                            <TableHead key={s.ac_stage_id} className="text-center text-xs">{s.title}</TableHead>
                          ))}
                          <TableHead className="text-center text-xs">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stages.map((origin) => {
                          const rowTotal = stages.reduce(
                            (a, dest) => a + (matrix.counts.get(`${origin.ac_stage_id}>${dest.ac_stage_id}`) ?? 0),
                            0,
                          );
                          return (
                            <TableRow key={origin.ac_stage_id}>
                              <TableCell className="font-medium">{origin.title}</TableCell>
                              {stages.map((dest) => {
                                const v = matrix.counts.get(`${origin.ac_stage_id}>${dest.ac_stage_id}`) ?? 0;
                                return (
                                  <TableCell key={dest.ac_stage_id} className="text-center tabular-nums">
                                    {v ? <Badge variant={origin.position < dest.position ? "default" : "secondary"}>{v}</Badge> : <span className="text-muted-foreground">–</span>}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center font-semibold tabular-nums">{rowTotal || "–"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Ranking de Ganhos por Proprietário</CardTitle>
                      <CardDescription>Negócios marcados como Ganho com fechamento no período</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Proprietário</TableHead>
                            <TableHead className="text-right">Ganhos</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-right">Win rate</TableHead>
                            <TableHead className="text-right">Ticket médio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ownerConversion.map((r, i) => (
                            <TableRow key={r.owner}>
                              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="font-medium">{r.owner}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                              <TableCell className="text-right tabular-nums">{brl(r.value)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatPercent(r.winRate)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(r.avgTicket)}</TableCell>
                            </TableRow>
                          ))}
                          {!ownerConversion.length && (
                            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem fechamentos no período</TableCell></TableRow>
                          )}
                          {!!ownerConversion.length && (
                            <TableRow className="border-t-2 font-semibold">
                              <TableCell />
                              <TableCell>Total</TableCell>
                              <TableCell className="text-right tabular-nums">{ownerConversion.reduce((sum, r) => sum + r.won, 0)}</TableCell>
                              <TableCell className="text-right tabular-nums">{brl(ownerConversion.reduce((sum, r) => sum + r.value, 0))}</TableCell>
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Motivos de Perda</CardTitle>
                      <CardDescription>Campo "Deal - Sales - Motivo de perda" · {lossRanking.total} negócios perdidos no período</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                          <TableHead>Motivo</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">% das perdas</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lossRanking.rows.map((r) => (
                            <TableRow key={r.reason}>
                              <TableCell className="font-medium">{r.reason}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.qtd}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {lossRanking.total ? ((r.qtd / lossRanking.total) * 100).toFixed(0) : 0}%
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{brl(r.valor)}</TableCell>
                            </TableRow>
                          ))}
                          {!lossRanking.rows.length && (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sem perdas no período</TableCell></TableRow>
                          )}
                          {!!lossRanking.rows.length && (
                            <TableRow className="border-t-2 font-semibold">
                              <TableCell>Total</TableCell>
                              <TableCell className="text-right tabular-nums">{lossRanking.total}</TableCell>
                              <TableCell className="text-right tabular-nums">100%</TableCell>
                              <TableCell className="text-right tabular-nums">{brl(lossRanking.totalValor)}</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Tarefas por Negócio</CardTitle>
                      <CardDescription>
                        Retrato atual das tarefas · concluídas contadas no período · visão por {taskDim === "owner" ? "proprietário" : taskDim === "stage" ? "etapa" : "ação"}
                      </CardDescription>
                    </div>
                    <Select value={taskDim} onValueChange={(v) => setTaskDim(v as typeof taskDim)}>
                      <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Por proprietário</SelectItem>
                        <SelectItem value="stage">Por etapa</SelectItem>
                        <SelectItem value="action">Por ação</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[160px]">
                            {taskDim === "owner" ? "Proprietário" : taskDim === "stage" ? "Etapa" : "Ação"}
                          </TableHead>
                          <TableHead className="text-right">Próximas</TableHead>
                          <TableHead className="text-right">Agendadas</TableHead>
                          <TableHead className="text-right">Atrasadas</TableHead>
                          <TableHead className="text-right">Concluídas</TableHead>
                          <TableHead className="text-right">Sem tarefa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {taskMatrix.rows.map((r) => (
                          <TableRow key={r.key}>
                            <TableCell className="font-medium">{r.key}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.proximas || "–"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.agendadas || "–"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.atrasadas ? <Badge variant="destructive">{r.atrasadas}</Badge> : <span className="text-muted-foreground">–</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.concluidas || "–"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.semTarefa ? <Badge variant="secondary">{r.semTarefa}</Badge> : <span className="text-muted-foreground">–</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {!taskMatrix.rows.length && (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem tarefas sincronizadas</TableCell></TableRow>
                        )}
                        {!!taskMatrix.rows.length && (
                          <TableRow className="border-t-2 font-semibold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right tabular-nums">{taskMatrix.totals.proximas}</TableCell>
                            <TableCell className="text-right tabular-nums">{taskMatrix.totals.agendadas}</TableCell>
                            <TableCell className="text-right tabular-nums">{taskMatrix.totals.atrasadas}</TableCell>
                            <TableCell className="text-right tabular-nums">{taskMatrix.totals.concluidas}</TableCell>
                            <TableCell className="text-right tabular-nums">{taskMatrix.totals.semTarefa}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>


                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Negócios com atividade no período</CardTitle>
                      <CardDescription>{dealsInPeriod.length} negócios</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => exportDeals("csv")}>
                        <Download className="mr-2 h-4 w-4" /> CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportDeals("xlsx")}>
                        <Download className="mr-2 h-4 w-4" /> XLSX
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Negócio</TableHead>
                          <TableHead className="hidden md:table-cell">Contato</TableHead>
                          <TableHead>Etapa</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="hidden lg:table-cell">Criado</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dealsInPeriod.slice(0, 300).map((d) => (
                          <TableRow key={d.ac_deal_id}>
                            <TableCell className="max-w-[220px] truncate font-medium">{d.title ?? "—"}</TableCell>
                            <TableCell className="hidden max-w-[220px] truncate md:table-cell text-sm text-muted-foreground">
                              {d.contact_email ?? d.contact_name ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">{stageName(d.ac_stage_id)}</TableCell>
                            <TableCell>
                              <Badge variant={d.status === 1 ? "default" : d.status === 2 ? "destructive" : "secondary"}>
                                {STATUS_LABEL[d.status] ?? d.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{brl(Number(d.value || 0))}</TableCell>
                            <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{spDateTime(d.deal_created_at)}</TableCell>
                            <TableCell>
                              <a
                                href={`${AC_APP_BASE}/app/deals/${d.ac_deal_id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                                title="Abrir no ActiveCampaign"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {dealsInPeriod.length > 300 && (
                      <p className="pt-3 text-xs text-muted-foreground">Mostrando os 300 mais recentes. Use a exportação para a lista completa.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ---------------- CONEXÃO ---------------- */}
          <TabsContent value="conexao" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
                <CardDescription>Ingestão em tempo quase real por webhook, com sync horário de segurança.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <InfoBox label="Funil atual" value={current?.title ?? "—"} />
                  <InfoBox label="Último webhook" value={spDateTime(current?.last_webhook_at)} />
                  <InfoBox label="Último sync" value={spDateTime(current?.last_sync_at)} />
                </div>
                <div className="space-y-1.5">
                  <Label>URL do webhook (cole no ActiveCampaign, em Settings → Developer → Webhooks)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={`${WEBHOOK_URL}?secret=SEU_AC_WEBHOOK_SECRET`} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${WEBHOOK_URL}?secret=SEU_AC_WEBHOOK_SECRET`);
                        toast.success("URL copiada — troque SEU_AC_WEBHOOK_SECRET pelo segredo configurado");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assine os eventos de deal: deal_add, deal_update, deal_stage_change (ou "todos os eventos de negócio").
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Funis disponíveis</CardTitle>
                  <CardDescription>Ligue o switch para acompanhar as métricas de um funil.</CardDescription>
                </div>
                <Button variant="outline" onClick={listFunnels} disabled={listing}>
                  {listing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar lista do AC
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funil</TableHead>
                      <TableHead className="hidden sm:table-cell">ID</TableHead>
                      <TableHead className="hidden md:table-cell">Negócios</TableHead>
                      <TableHead className="text-right">Conectado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funnels.map((f) => (
                      <TableRow key={f.ac_group_id}>
                        <TableCell className="font-medium">{f.title}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{f.ac_group_id}</TableCell>
                        <TableCell className="hidden md:table-cell tabular-nums">{f.is_connected ? f.deals_count : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={f.is_connected}
                            disabled={role !== "admin"}
                            onCheckedChange={(v) => toggleFunnel(f, v)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!funnels.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Clique em "Atualizar lista do AC" para carregar os funis.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Auditoria de etapas</CardTitle>
                  <CardDescription>
                    Compara, negócio a negócio, o funil no ActiveCampaign com o que está gravado aqui. Não grava nada.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={runAudit} disabled={auditing || !groupId}>
                  {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Auditar agora
                </Button>
              </CardHeader>
              {!!audit && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <InfoBox label="Negócios no AC" value={String(audit.ac_total ?? 0)} />
                    <InfoBox label="Negócios aqui" value={String(audit.db_total ?? 0)} />
                    <InfoBox label="Faltando aqui" value={String(audit.missing_in_db ?? 0)} />
                    <InfoBox label="Etapa/status diferente" value={String(audit.divergent ?? 0)} />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Etapa (em aberto)</TableHead>
                          <TableHead className="text-right">ActiveCampaign</TableHead>
                          <TableHead className="text-right">Painel</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(audit.stage_counts ?? []).map((s: any) => (
                          <TableRow key={s.stage}>
                            <TableCell className="font-medium">{s.stage}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.ac}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.db}</TableCell>
                            <TableCell className={`text-right tabular-nums ${s.ac === s.db ? "text-muted-foreground" : "text-destructive"}`}>
                              {s.db - s.ac}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {(audit.missing_in_db > 0 || audit.extra_in_db > 0) && (
                    <p className="text-xs text-muted-foreground">
                      Clique em "Sincronizar agora" para corrigir: a sincronização importa os negócios faltantes e remove
                      os que já saíram do funil.
                    </p>
                  )}
                </CardContent>
              )}
            </Card>



            {!!groupId && (
              <AcOpportunityMetricConfig
                groupId={groupId}
                stages={stages}
                owners={owners}
                canEdit={role === "admin"}
              />
            )}
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function formatCurrency(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : brl(value);
}

function formatDays(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)} dias`;
}

function formatDelta(value: number | null, suffix = "%"): string {
  if (value === null) return "Sem base anterior";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix} vs anterior`;
}

function SmallDelta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="ml-1 text-xs text-muted-foreground">—</span>;
  return <span className={`ml-1 text-xs ${value >= 0 ? "text-success" : "text-destructive"}`}>{`(${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix})`}</span>;
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span className="truncate">{label}</span></div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}
