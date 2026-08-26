import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, History, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CollapseToggle } from "@/components/goals/tactical/CollapseToggle";
import { CohortListDialog } from "./CohortListDialog";
import { ChurnHistoryDialog } from "./ChurnHistoryDialog";
import { CohortRetentionChart } from "./CohortRetentionChart";
import {
  buildCurve,
  cohortRowsToMatrix,
  formatBRL,
  formatDateBR,
  summarize,
  summarizeCurve,
  CHURN_SOURCE_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  type CohortContact,
  type CohortResult,
  type CohortRow,
} from "@/lib/campaignCohort";
import { campaignLabel, type HistoryCampaign } from "@/lib/campaignHistory";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success text-success-foreground",
  trial: "bg-warning text-warning-foreground",
  canceled: "bg-destructive text-destructive-foreground",
  never: "bg-secondary text-secondary-foreground",
  unknown: "bg-secondary text-secondary-foreground",
};

interface Props {
  campaigns: HistoryCampaign[];
  campaign: HistoryCampaign | null;
  onChangeCampaign: (id: string) => void;
}

export function CohortPanel({ campaigns, campaign, onChangeCampaign }: Props) {
  const { toast } = useToast();
  const [listOpen, setListOpen] = useState(false);
  const [churnOpen, setChurnOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stripeFilling, setStripeFilling] = useState(false);
  const [stripeProgress, setStripeProgress] = useState<{ done: number; total: number } | null>(null);
  const stripeCancelRef = useRef(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tableOpen, setTableOpen] = useState(true);

  const campaignId = campaign?.id ?? "";

  const contactsQ = useQuery({
    queryKey: ["cohort-contacts", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_cohort_contacts")
        .select("id, campaign_id, email, email_norm, name, offer, activated_at")
        .eq("campaign_id", campaignId)
        .order("email_norm");
      if (error) throw error;
      return (data ?? []) as unknown as CohortContact[];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["cohort-results", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_cohort_results")
        .select("*")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      const map = new Map<string, CohortResult>();
      for (const r of (data ?? []) as unknown as CohortResult[]) map.set(r.contact_id, r);
      return map;
    },
  });

  const curveQ = useQuery({
    queryKey: ["cohort-curve", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("campaign_cohort_curve", { p_campaign_id: campaignId });
      if (error) throw error;
      return buildCurve((data ?? []) as { month_offset: number; active_count: number; mrr_total: number }[]);
    },
  });

  const rows: CohortRow[] = useMemo(() => {
    const results = resultsQ.data ?? new Map<string, CohortResult>();
    return (contactsQ.data ?? []).map((c) => ({ ...c, result: results.get(c.id) ?? null }));
  }, [contactsQ.data, resultsQ.data]);

  const summary = useMemo(() => summarize(rows), [rows]);

  const curve = curveQ.data ?? [];
  const curveTotals = useMemo(
    () => summarizeCurve(curve, summary.active + summary.canceled),
    [curve, summary.active, summary.canceled],
  );


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const status = r.result?.status ?? "never";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.email_norm.includes(q) ||
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.result?.plan_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const refreshCohort = async () => {
    if (!campaignId) return;
    setRefreshing(true);
    try {
      const { data, error } = await (supabase as any).rpc("campaign_cohort_refresh", { p_campaign_id: campaignId });
      if (error) throw error;
      await Promise.all([resultsQ.refetch(), curveQ.refetch()]);
      const snap = (data as any)?.snapshot_date;
      toast({
        title: "Cohort recalculado",
        description: `${(data as any)?.computed ?? 0} contato(s) cruzados${snap ? ` · snapshot ${formatDateBR(snap)}` : ""}.`,
      });
    } catch (e) {
      toast({ title: "Erro ao recalcular cohort", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const fillFromStripe = async (mode: "missing" | "all" = "missing") => {
    if (!campaignId) return;
    setStripeFilling(true);
    setStripeProgress(null);
    stripeCancelRef.current = false;
    try {
      let offset = 0;
      let total = 0;
      let matched = 0;
      let safety = 0;
      const allErrors: string[] = [];
      while (safety++ < 500) {
        if (stripeCancelRef.current) break;
        const { data, error } = await supabase.functions.invoke("cohort-stripe-live", {
          body: { campaign_id: campaignId, mode, offset, batch_size: 40, time_budget_ms: 60000 },
        });
        if (error) throw error;
        const d = (data ?? {}) as any;
        total = Number(d.total ?? 0);
        matched += Number(d.matched ?? 0);
        if (Array.isArray(d.errors)) allErrors.push(...d.errors);
        const done = d.done || d.next_offset == null;
        offset = Number(d.next_offset ?? total);
        setStripeProgress({ done: Math.min(offset, total), total });
        if (done) break;
        if (!Number(d.processed ?? 0)) break;
      }
      await Promise.all([resultsQ.refetch(), curveQ.refetch()]);
      toast({
        title: stripeCancelRef.current ? "Consulta interrompida" : "Consulta na Stripe concluída",
        description: `${matched} de ${total} e-mail(s) identificados na Stripe.${allErrors.length ? ` ${allErrors.length} erro(s).` : ""}`,
      });
    } catch (e) {
      toast({ title: "Erro na consulta Stripe", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setStripeFilling(false);
      setStripeProgress(null);
      stripeCancelRef.current = false;
    }
  };

  const removeContact = async (id: string, email: string) => {
    if (!confirm(`Remover ${email} da lista da campanha?`)) return;
    const { error } = await supabase.from("campaign_cohort_contacts").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    contactsQ.refetch();
    resultsQ.refetch();
  };

  const clearList = async () => {
    if (!campaignId) return;
    if (!confirm("Remover TODOS os e-mails da lista desta campanha?")) return;
    const { error } = await supabase.from("campaign_cohort_contacts").delete().eq("campaign_id", campaignId);
    if (error) {
      toast({ title: "Erro ao limpar lista", description: error.message, variant: "destructive" });
      return;
    }
    contactsQ.refetch();
    resultsQ.refetch();
    curveQ.refetch();
  };

  const baseName = `cohort-${campaign?.name ?? "campanha"}`.replace(/[^\w-]+/g, "-").toLowerCase();

  const exportCsv = () => {
    const matrix = cohortRowsToMatrix(filtered);
    const csv = matrix.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet(cohortRowsToMatrix(filtered));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cohort");
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  };

  const cards = [
    { label: "Total da lista", value: summary.total.toLocaleString("pt-BR") },
    { label: "Encontrados na base", value: summary.found.toLocaleString("pt-BR") },
    { label: "Ativos", value: summary.active.toLocaleString("pt-BR") },
    { label: "Cancelados", value: summary.canceled.toLocaleString("pt-BR") },
    { label: "Em trial", value: summary.trial.toLocaleString("pt-BR") },
    { label: "Nunca assinaram", value: summary.never.toLocaleString("pt-BR") },
    { label: "MRR ativo hoje", value: formatBRL(summary.mrrActive) },
    { label: "Receita Acumulada", value: curve.length ? formatBRL(curveTotals.revenueAccumulated) : "—" },
    { label: "LTV Real", value: curveTotals.ltvReal == null ? "—" : formatBRL(curveTotals.ltvReal) },
    {
      label: "% de retenção",
      value: summary.retentionPct == null ? "—" : `${summary.retentionPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
    },
  ];


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Label className="text-xs">Campanha</Label>
          <Select value={campaignId} onValueChange={onChangeCampaign}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setListOpen(true)} disabled={!campaign}>
          <Users className="h-4 w-4 mr-1" />Lista de clientes
        </Button>
        <Button size="sm" onClick={refreshCohort} disabled={!campaign || refreshing || !rows.length}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Recalculando…" : "Recalcular cohort"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fillFromStripe("missing")}
          disabled={!campaign || stripeFilling || refreshing || !rows.length}
          title="Consulta a API da Stripe em tempo real apenas para os contatos não identificados"
        >
          <Search className={`h-4 w-4 mr-1 ${stripeFilling ? "animate-pulse" : ""}`} />
          {stripeFilling
            ? `Consultando Stripe${stripeProgress ? ` (${stripeProgress.done}/${stripeProgress.total})` : "…"}`
            : "Consultar Stripe (ao vivo)"}
        </Button>
        {stripeFilling ? (
          <Button variant="ghost" size="sm" onClick={() => { stripeCancelRef.current = true; }}>
            Cancelar
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fillFromStripe("all")}
            disabled={!campaign || refreshing || !rows.length}
            title="Reconsulta na Stripe todos os e-mails da lista, sobrescrevendo os resultados"
          >
            Reconsultar todos
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setChurnOpen(true)}
          title="Base histórica de cancelamentos usada para datar o churn no cohort"
        >
          <History className="h-4 w-4 mr-1" />Base de churn
        </Button>
      </div>

      {!campaign ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Selecione uma campanha para medir o cohort.</CardContent></Card>
      ) : !rows.length ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p>Nenhum e-mail importado para esta campanha ainda.</p>
            <p>Use <strong>Lista de clientes</strong> para importar uma planilha ou colar os e-mails de ativação e depois recalcule o cohort.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Último cálculo: {summary.computedAt ? new Date(summary.computedAt).toLocaleString("pt-BR") : "nunca"}
            </span>
            <span>·</span>
            <span>Snapshot Metabase: {formatDateBR(summary.snapshotDate)}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-xl font-bold tabular-nums">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <CohortRetentionChart curve={curveQ.data ?? []} rows={rows} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Clientes da campanha ({filtered.length})</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />CSV</Button>
                <Button variant="outline" size="sm" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4 mr-1" />XLSX</Button>
                <Button variant="ghost" size="sm" onClick={clearList}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                <CollapseToggle open={tableOpen} onToggle={() => setTableOpen((o) => !o)} />
              </div>
            </CardHeader>
            {tableOpen && (
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <Label className="text-xs">Buscar</Label>
                    <Input className="h-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="E-mail, nome ou plano" />
                  </div>
                  <div className="w-[180px]">
                    <Label className="text-xs">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {Object.keys(STATUS_LABEL).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-2 py-2 text-left">E-mail</th>
                        <th className="px-2 py-2 text-left">Nome</th>
                        <th className="px-2 py-2 text-left">Plano</th>
                        <th className="px-2 py-2 text-right">MRR</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Ativação</th>
                        <th className="px-2 py-2 text-left">Cancelamento</th>
                        <th className="px-2 py-2 text-left">Origem</th>
                        <th className="px-2 py-2 text-left">Fonte</th>
                        <th className="px-2 py-2 text-left">Fonte churn</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        const res = r.result;
                        const status = res?.status ?? "never";
                        return (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="px-2 py-2">{r.email_norm}</td>
                            <td className="px-2 py-2">{r.name ?? "—"}</td>
                            <td className="px-2 py-2">{res?.plan_name ?? res?.offer_name ?? r.offer ?? "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{formatBRL(res?.mrr)}</td>
                            <td className="px-2 py-2">
                              <Badge className={`text-xs ${STATUS_BADGE[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</Badge>
                            </td>
                            <td className="px-2 py-2">{formatDateBR(r.activated_at ?? res?.started_at)}</td>
                            <td className="px-2 py-2">{formatDateBR(res?.canceled_at)}</td>
                            <td className="px-2 py-2">{res?.origem_cliente ?? "—"}</td>
                            <td className="px-2 py-2 text-xs text-muted-foreground">
                              {res?.source ? SOURCE_LABEL[res.source] ?? res.source : "—"}
                            </td>
                            <td className="px-2 py-2 text-xs text-muted-foreground">
                              {res?.churn_source ? CHURN_SOURCE_LABEL[res.churn_source] ?? res.churn_source : "—"}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeContact(r.id, r.email_norm)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {!filtered.length && (
                        <tr><td colSpan={11} className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhum cliente com esses filtros.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}

      {campaign && (
        <CohortListDialog
          open={listOpen}
          onOpenChange={setListOpen}
          campaign={campaign}
          onImported={() => {
            contactsQ.refetch();
            resultsQ.refetch();
          }}
        />
      )}

      <ChurnHistoryDialog
        open={churnOpen}
        onOpenChange={setChurnOpen}
        onImported={() => { resultsQ.refetch(); curveQ.refetch(); }}
      />
    </div>
  );
}
