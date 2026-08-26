import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { ManagerOnly } from "@/components/ManagerOnly";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Clock, Download, FileDown, History, Pencil, Plus, Sparkles, Tag, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CampaignHistoryTable } from "@/components/campaign-history/CampaignHistoryTable";
import { CampaignValuesForm } from "@/components/campaign-history/CampaignValuesForm";
import { CampaignHistoryImportDialog } from "@/components/campaign-history/CampaignHistoryImportDialog";
import { MetricEvolutionChart } from "@/components/campaign-history/MetricEvolutionChart";
import { CampaignCompare } from "@/components/campaign-history/CampaignCompare";
import { MetricsConfig } from "@/components/campaign-history/MetricsConfig";
import { CohortPanel } from "@/components/campaign-history/CohortPanel";
import { CohortRetentionEvolution } from "@/components/campaign-history/CohortRetentionEvolution";

import { buildCampaignHistoryPdf } from "@/lib/campaignHistoryPdf";
import {
  attainmentPct,
  campaignLabel,
  formatMetricValue,
  formatPct,
  sortCampaigns,
  type HistoryCampaign,
  type HistoryMetric,
  type HistoryValue,
} from "@/lib/campaignHistory";

const emptyForm = {
  name: "",
  ref_month: "",
  start_date: "",
  end_date: "",
  channel: "",
  notes: "",
  theme: "",
  workshop_duration: "",
  main_offer: "",
  downsell_offer: "",
};

function CampaignDialog({
  open,
  onOpenChange,
  campaign,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: HistoryCampaign | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(
    campaign
      ? {
          name: campaign.name,
          ref_month: campaign.ref_month ? campaign.ref_month.slice(0, 7) : "",
          start_date: campaign.start_date ?? "",
          end_date: campaign.end_date ?? "",
          channel: campaign.channel ?? "",
          notes: campaign.notes ?? "",
          theme: campaign.theme ?? "",
          workshop_duration: campaign.workshop_duration ?? "",
          main_offer: campaign.main_offer ?? "",
          downsell_offer: campaign.downsell_offer ?? "",
        }
      : emptyForm,
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Informe o nome da campanha", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      ref_month: form.ref_month ? `${form.ref_month}-01` : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      channel: form.channel || null,
      notes: form.notes || null,
      theme: form.theme || null,
      workshop_duration: form.workshop_duration || null,
      main_offer: form.main_offer || null,
      downsell_offer: form.downsell_offer || null,
    };
    const { error } = campaign
      ? await supabase.from("campaign_history").update(payload).eq("id", campaign.id)
      : await supabase.from("campaign_history").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar campanha", description: error.message, variant: "destructive" });
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{campaign ? "Editar campanha" : "Nova campanha histórica"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Black Friday 2022" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Mês de referência</Label>
              <Input type="month" value={form.ref_month} onChange={(e) => setForm({ ...form, ref_month: e.target.value })} />
            </div>
            <div>
              <Label>Canal</Label>
              <Input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="Ex.: Ads, Base, Outbound" />
            </div>
            <div>
              <Label>Início</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tema da campanha</Label>
              <Input
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
                placeholder="Ex.: Precificação para clínicas"
              />
            </div>
            <div>
              <Label>Duração do workshop</Label>
              <Input
                value={form.workshop_duration}
                onChange={(e) => setForm({ ...form, workshop_duration: e.target.value })}
                placeholder="Ex.: 3 dias · 2h por dia"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Oferta principal</Label>
              <Input
                value={form.main_offer}
                onChange={(e) => setForm({ ...form, main_offer: e.target.value })}
                placeholder="Ex.: Consultoria BPO 12x R$ 1.997"
              />
            </div>
            <div>
              <Label>Downsell (opcional)</Label>
              <Input
                value={form.downsell_offer}
                onChange={(e) => setForm({ ...form, downsell_offer: e.target.value })}
                placeholder="Ex.: Software anual à vista"
              />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignHistory() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [valuesOpen, setValuesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [campaignDialog, setCampaignDialog] = useState<{ open: boolean; campaign: HistoryCampaign | null }>({ open: false, campaign: null });

  const metricsQ = useQuery({
    queryKey: ["campaign-history-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_history_metrics").select("*").order("position");
      if (error) throw error;
      return (data ?? []) as unknown as HistoryMetric[];
    },
  });

  const campaignsQ = useQuery({
    queryKey: ["campaign-history-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_history").select("*");
      if (error) throw error;
      return sortCampaigns((data ?? []) as unknown as HistoryCampaign[]);
    },
  });

  const valuesQ = useQuery({
    queryKey: ["campaign-history-values"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_history_values").select("*");
      if (error) throw error;
      const map = new Map<string, HistoryValue>();
      for (const v of (data ?? []) as unknown as HistoryValue[]) map.set(`${v.campaign_id}|${v.metric_id}`, v);
      return map;
    },
  });

  const allMetrics = metricsQ.data ?? [];
  const activeMetrics = allMetrics.filter((m) => m.is_active);
  const campaigns = campaignsQ.data ?? [];
  const values = valuesQ.data ?? new Map<string, HistoryValue>();

  const selected = campaigns.find((c) => c.id === selectedId) ?? campaigns[campaigns.length - 1] ?? null;
  const compareCampaignA = campaigns.find((c) => c.id === compareA) ?? campaigns[campaigns.length - 2] ?? null;
  const compareCampaignB = campaigns.find((c) => c.id === compareB) ?? campaigns[campaigns.length - 1] ?? null;

  const refreshAll = () => {
    metricsQ.refetch();
    campaignsQ.refetch();
    valuesQ.refetch();
  };

  // KPIs em destaque: ordem fixa, 2 linhas de 4 cards.
  // "Total de Vendas" = total de Conversões (indicador "conversao").
  // "% Conversão" = taxa calculada conversões / leads.
  const kpis = useMemo(() => {
    if (!selected) return [];
    const bySlug = new Map(activeMetrics.map((m) => [m.slug, m]));
    // cap=true → meta de teto (quanto menor o realizado, melhor) — Investimento e CPL.
    // cap=false → meta de base (quanto maior, melhor) — demais indicadores.
    const HIGHLIGHT: { label: string; slug?: string | string[]; rate?: { num: string; den: string }; cap?: boolean }[] = [
      { label: "Investimento", slug: "investimento", cap: true },
      { label: "CPL", slug: "cpl", cap: true },
      { label: "Total de Leads", slug: "leads_total" },
      { label: "% Conversão", rate: { num: "conversao", den: "leads_total" } },
      { label: "Total de Vendas", slug: "conversao" },
      { label: "MRR Gerado", slug: "mrr" },
      { label: "LTV/CAC", slug: "ltv_cac" },
      { label: "Tempo de ROI", slug: "tempo_roi", cap: true },
    ];

    const val = (m: HistoryMetric): { target: number | null; actual: number | null } => {
      const v = values.get(`${selected.id}|${m.id}`);
      return {
        target: v?.target_value == null ? null : Number(v.target_value),
        actual: v?.actual_value == null ? null : Number(v.actual_value),
      };
    };

    return HIGHLIGHT.map((k) => {
      // Taxa calculada: % Conversão = conversões / leads
      if (k.rate) {
        const num = bySlug.get(k.rate.num);
        const den = bySlug.get(k.rate.den);
        if (!num || !den) return null;
        const n = val(num);
        const d = val(den);
        const rate = (a: number | null, b: number | null): number | null =>
          a != null && b != null && b !== 0 ? (a / b) * 100 : null;
        const actual = rate(n.actual, d.actual);
        const target = rate(n.target, d.target);
        return {
          label: k.label,
          actual: formatMetricValue(actual, "percent"),
          target: formatMetricValue(target, "percent"),
          attainment: attainmentPct(target, actual),
          cap: false,
        };
      }

      const slugs = Array.isArray(k.slug) ? k.slug : [k.slug];
      const metrics = slugs.map((s) => bySlug.get(s)).filter(Boolean) as HistoryMetric[];
      if (!metrics.length) return null;
      const unit = metrics.length === 1 ? metrics[0].unit : "number";
      let target = 0;
      let actual = 0;
      let hasVal = false;
      for (const m of metrics) {
        const v = val(m);
        if (v.target != null) {
          target += v.target;
          hasVal = true;
        }
        if (v.actual != null) {
          actual += v.actual;
          hasVal = true;
        }
      }
      if (!hasVal) {
        return { label: k.label, actual: formatMetricValue(null, unit), target: formatMetricValue(null, unit), attainment: null, cap: !!k.cap };
      }
      return {
        label: k.label,
        actual: formatMetricValue(actual, unit),
        target: formatMetricValue(target, unit),
        attainment: attainmentPct(target, actual),
        cap: !!k.cap,
      };
    }).filter((k): k is NonNullable<typeof k> => Boolean(k));
  }, [selected, activeMetrics, values]);

  const exportCsv = () => {
    if (!selected) return;
    const rows = [["Indicador", "Seção", "Meta", "Realizado", "% Atingimento", "% Meta Funil", "% Realizado Funil"]];
    for (const m of activeMetrics) {
      const v = values.get(`${selected.id}|${m.id}`);
      rows.push([
        m.label,
        m.section ?? "",
        String(v?.target_value ?? ""),
        String(v?.actual_value ?? ""),
        String(attainmentPct(v?.target_value, v?.actual_value)?.toFixed(1) ?? ""),
        String(v?.funnel_target_pct ?? ""),
        String(v?.funnel_actual_pct ?? ""),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-campanha-${selected.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = buildCampaignHistoryPdf(activeMetrics, values, {
      campaign: selected,
      compareA: compareCampaignA,
      compareB: compareCampaignB,
      evolutionCampaigns: campaigns,
      evolutionMetricIds: activeMetrics.map((m) => m.id),
    });
    doc.save(`historico-campanhas-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const removeCampaign = async (c: HistoryCampaign) => {
    if (!confirm(`Excluir a campanha "${c.name}" e seus valores?`)) return;
    const { error } = await supabase.from("campaign_history").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setSelectedId("");
    refreshAll();
  };

  return (
    <Layout>
      <ManagerOnly>
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Button variant="ghost" size="sm" className="mb-1 -ml-2" onClick={() => navigate("/sales-campaigns")}>
                <ArrowLeft className="h-4 w-4 mr-1" />Campanhas de Sales
              </Button>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <History className="h-6 w-6 text-primary" />Histórico de Campanhas
              </h1>
              <p className="text-sm text-muted-foreground">
                Compare metas e realizados de campanhas desde 2022, com indicadores parametrizáveis.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />Importar planilha
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!selected}>
                <Download className="h-4 w-4 mr-1" />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={!campaigns.length}>
                <FileDown className="h-4 w-4 mr-1" />PDF
              </Button>
              <Button size="sm" onClick={() => setCampaignDialog({ open: true, campaign: null })}>
                <Plus className="h-4 w-4 mr-1" />Nova campanha
              </Button>
            </div>
          </div>

          <Tabs defaultValue="painel">
            <TabsList className="flex w-full flex-wrap justify-start">
              <TabsTrigger value="painel">Painel</TabsTrigger>
              <TabsTrigger value="evolucao">Evolução</TabsTrigger>
              <TabsTrigger value="comparar">Comparar</TabsTrigger>
              <TabsTrigger value="cohort">Cohort</TabsTrigger>
              <TabsTrigger value="config">Configurações</TabsTrigger>
            </TabsList>

            <TabsContent value="painel" className="space-y-4 pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Label className="text-xs">Campanha</Label>
                  <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {selected && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setValuesOpen(true)}>
                      <Pencil className="h-4 w-4 mr-1" />Lançar valores
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCampaignDialog({ open: true, campaign: selected })}>
                      Editar campanha
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeCampaign(selected)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>

              {selected && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />Tema da campanha
                      </p>
                      <p className="text-center text-base font-semibold leading-snug">
                        {selected.theme || <span className="font-normal text-muted-foreground">Não informado</span>}
                      </p>
                      <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Duração do workshop: {selected.workshop_duration || "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Tag className="h-3.5 w-3.5 text-primary" />Ofertas da campanha
                      </p>
                      <div>
                        <p className="text-xs text-muted-foreground">Oferta principal</p>
                        <p className="text-base font-semibold leading-snug">
                          {selected.main_offer || <span className="font-normal text-muted-foreground">Não informada</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Downsell</p>
                        <p className="text-sm font-medium leading-snug">
                          {selected.downsell_offer || <span className="font-normal text-muted-foreground">Sem downsell</span>}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}


              {kpis.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {kpis.map((k) => {
                    // Cor da etiqueta conforme o % exibido (arredondado) e a direção da meta.
                    // Se o arredondamento mostrar 100%, trata como atingido (verde) por didática.
                    const rounded = k.attainment == null ? null : Math.round(k.attainment);
                    let badgeClass = "bg-secondary text-secondary-foreground";
                    if (rounded != null) {
                      if (k.cap) {
                        // teto: menor é melhor → verde se ≤100%, amarelo se 101–115%, vermelho se >115%.
                        badgeClass =
                          rounded <= 100
                            ? "bg-success text-success-foreground"
                            : rounded <= 115
                            ? "bg-warning text-warning-foreground"
                            : "bg-destructive text-destructive-foreground";
                      } else {
                        // base: maior é melhor → verde se ≥100%, amarelo se 85–99%, vermelho se <85%.
                        badgeClass =
                          rounded >= 100
                            ? "bg-success text-success-foreground"
                            : rounded >= 85
                            ? "bg-warning text-warning-foreground"
                            : "bg-destructive text-destructive-foreground";
                      }
                    }
                    return (
                      <Card key={k.label}>
                        <CardContent className="p-4">
                          <p className="truncate text-xs text-muted-foreground">{k.label}</p>
                          <p className="text-xl font-bold tabular-nums">{k.actual}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">Meta: {k.target}</p>
                          <Badge className={`mt-1 text-xs ${badgeClass}`}>{formatPct(k.attainment)} da meta</Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {selected ? `Desempenho — ${campaignLabel(selected)}` : "Nenhuma campanha selecionada"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-6 sm:pt-0">
                  {selected ? (
                    <CampaignHistoryTable metrics={activeMetrics} values={values} campaignId={selected.id} />
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">
                      Cadastre uma campanha ou importe a planilha histórica para começar.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evolucao" className="space-y-4 pt-4">
              <MetricEvolutionChart metrics={activeMetrics} campaigns={campaigns} values={values} />
              <CohortRetentionEvolution campaigns={campaigns} />
            </TabsContent>


            <TabsContent value="comparar" className="pt-4">
              <CampaignCompare
                metrics={activeMetrics}
                campaigns={campaigns}
                values={values}
                aId={compareCampaignA?.id ?? ""}
                bId={compareCampaignB?.id ?? ""}
                onChangeA={setCompareA}
                onChangeB={setCompareB}
              />
            </TabsContent>

            <TabsContent value="cohort" className="pt-4">
              <CohortPanel campaigns={campaigns} campaign={selected} onChangeCampaign={setSelectedId} />
            </TabsContent>

            <TabsContent value="config" className="pt-4">
              <MetricsConfig metrics={allMetrics} onRefresh={refreshAll} />
            </TabsContent>
          </Tabs>
        </div>

        {selected && (
          <CampaignValuesForm
            open={valuesOpen}
            onOpenChange={setValuesOpen}
            campaign={selected}
            metrics={activeMetrics}
            values={values}
            onSaved={refreshAll}
          />
        )}
        <CampaignHistoryImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          metrics={allMetrics}
          campaigns={campaigns}
          defaultCampaign={selected}
          onImported={refreshAll}
        />
        {campaignDialog.open && (
          <CampaignDialog
            open={campaignDialog.open}
            onOpenChange={(v) => setCampaignDialog({ open: v, campaign: v ? campaignDialog.campaign : null })}
            campaign={campaignDialog.campaign}
            onSaved={refreshAll}
          />
        )}
      </ManagerOnly>
    </Layout>
  );
}
