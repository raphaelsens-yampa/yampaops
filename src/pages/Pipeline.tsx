import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Settings, X, Phone, Download, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { StageManager } from "@/components/StageManager";
import { NewOpportunityDialog } from "@/components/NewOpportunityDialog";
import { PipelineManager } from "@/components/PipelineManager";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useToast } from "@/hooks/use-toast";
import { EditOpportunityDialog } from "@/components/EditOpportunityDialog";
import { StripePendingActions } from "@/components/StripePendingActions";
import { useOpportunityTags, useTags } from "@/hooks/useTags";
import { TagChip } from "@/components/tags/TagChip";
import { format } from "date-fns";

const PENDING_STRIPE = "pendencias_stripe";

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

export default function PipelinePage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [currentPipelineId, setCurrentPipelineId] = useState<string>("");
  const { stages, stageOrder, stageLabels, stageColors, loading: stagesLoading, refetch } = usePipelineStages(currentPipelineId || undefined);
  const [leads, setLeads] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<any | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSyncAC = async () => {
    setSyncing(true);
    toast({ title: "Sincronização iniciada", description: "Trazendo dados do ActiveCampaign em segundo plano. Isso pode levar alguns minutos." });
    const { data, error } = await supabase.functions.invoke("ac-sync-initial", { body: { force: true } });
    if (error) {
      toast({ title: "Erro ao iniciar sync", description: error.message, variant: "destructive" });
      setSyncing(false);
      return;
    }
    // Polling: a cada 15s recarrega dados; após 3 min libera o botão de qualquer forma
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 15;
      await loadData();
      const { data: settings } = await supabase.from("integration_settings").select("sync_status, last_full_sync_at").limit(1).maybeSingle();
      if (settings?.sync_status === "idle" || elapsed >= 360) {
        clearInterval(interval);
        setSyncing(false);
        toast({ title: "Sincronização concluída", description: "Pipeline atualizado com os dados do AC." });
      }
    }, 15000);
  };

  const loadPipelines = useCallback(async () => {
    const { data } = await supabase.from("pipelines").select("*").order("is_default", { ascending: false }).order("name");
    const list = (data || []) as Pipeline[];
    setPipelines(list);
    if (!currentPipelineId && list.length > 0) {
      const def = list.find(p => p.is_default);
      setCurrentPipelineId(def?.id || list[0].id);
    }
  }, [currentPipelineId]);

  const loadData = useCallback(async () => {
    if (!currentPipelineId) return;
    // Paginar oportunidades para contornar o limite de 1000 linhas do Supabase
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("opportunities")
        .select("*, contacts:contact_id(name, company, email, phone)")
        .eq("pipeline_id", currentPipelineId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) { toast({ title: "Erro ao carregar oportunidades", description: error.message, variant: "destructive" }); break; }
      const batch = data || [];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    const profsRes = await supabase.from("profiles").select("*");
    setLeads(all);
    setProfiles(profsRes.data || []);
    setLoading(false);
  }, [currentPipelineId, toast]);

  useEffect(() => { loadPipelines(); }, []);
  useEffect(() => { if (currentPipelineId) { setLoading(true); loadData(); refetch(); } }, [currentPipelineId]);

  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination) return;
    const newStage = destination.droppableId;
    const lead = leads.find(l => l.id === draggableId);
    if (!lead || lead.stage === newStage) return;

    // Block manual drag in/out of Pendências Stripe — must use Aprovar/Rejeitar buttons
    if (source.droppableId === PENDING_STRIPE || newStage === PENDING_STRIPE) {
      toast({
        title: "Use os botões",
        description: "Itens em Pendências Stripe só saem via Aprovar ou Rejeitar.",
        variant: "destructive",
      });
      return;
    }

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === draggableId ? { ...l, stage: newStage } : l));

    const { error } = await supabase.from("opportunities").update({ stage: newStage }).eq("id", draggableId);
    if (error) {
      toast({ title: "Erro ao mover", description: error.message, variant: "destructive" });
      setLeads(prev => prev.map(l => l.id === draggableId ? { ...l, stage: lead.stage } : l));
    }
  };

  const byChannel = filter === "all" ? leads : leads.filter(l => l.origin === filter);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? byChannel.filter((l: any) => {
        const fields = [
          l.title, l.name, l.company,
          l.contacts?.name, l.contacts?.company, l.contacts?.email,
        ];
        return fields.some((f) => typeof f === "string" && f.toLowerCase().includes(q));
      })
    : byChannel;

  const handleExport = () => {
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.full_name || p.email]));
    const rows = filtered.map((l: any) => ({
      "Título": l.title || "",
      "Nome": l.name || "",
      "Empresa": l.company || l.contacts?.company || "",
      "Email": l.contacts?.email || "",
      "Telefone": l.phone || l.contacts?.phone || "",
      "Etapa": stageLabels[l.stage] || l.stage,
      "Canal": ORIGIN_LABELS[l.origin] || l.origin,
      "Sub-origem": l.sub_origin || "",
      "MRR (R$)": l.estimated_mrr || 0,
      "TPV (R$)": l.estimated_tpv || 0,
      "Probabilidade (%)": l.probability || 0,
      "Vendedor": profileMap.get(l.consultant_id) || "",
      "Criado em": l.opportunity_created_at || l.created_at,
      "Última interação": l.last_interaction_at || "",
      "Convertido em": l.converted_at || "",
      "Fechado em": l.closed_at || "",
      "Previsão fechamento": l.estimated_close_date || "",
      "Notas": l.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Oportunidades");
    const fname = `pipeline-${currentPipeline?.name || "export"}-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast({ title: "Exportação concluída", description: `${rows.length} oportunidades exportadas.` });
  };

  // Tags lookup for visible cards (hooks must be called before any early return)
  const leadIds = leads.map((l) => l.id);
  const { data: tagMap = {} } = useOpportunityTags(leadIds);
  const { data: allTags = [] } = useTags();
  const tagsById = new Map(allTags.map((t) => [t.id, t]));

  if (loading || stagesLoading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  const currentPipeline = pipelines.find(p => p.id === currentPipelineId);

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold">
              {currentPipeline?.name || "Pipeline"}
            </h1>
            {pipelines.length > 1 && (
              <Select value={currentPipelineId} onValueChange={setCurrentPipelineId}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <>
                <NewOpportunityDialog
                  profiles={profiles}
                  stageOrder={stageOrder}
                  stageLabels={stageLabels}
                  onCreated={loadData}
                  pipelineId={currentPipelineId}
                />
                <PipelineManager
                  pipelines={pipelines}
                  currentPipelineId={currentPipelineId}
                  onSelect={setCurrentPipelineId}
                  onUpdate={loadPipelines}
                />
                <Dialog open={manageOpen} onOpenChange={setManageOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-1" /> Etapas
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Gerenciar Etapas do Pipeline</DialogTitle></DialogHeader>
                    <StageManager stages={stages} onUpdate={refetch} />
                  </DialogContent>
                </Dialog>
              </>
            )}
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {Object.entries(ORIGIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative w-56">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar oportunidade..."
                className="pl-8 pr-8 h-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Exportar Excel
            </Button>
            {role === "admin" && (
              <Button variant="outline" size="sm" onClick={handleSyncAC} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando..." : "Sincronizar AC"}
              </Button>
            )}
          </div>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 pb-2 items-start h-full">
            {stageOrder.map(stage => {
              const stageLeads = filtered.filter(l => l.stage === stage);
              const stageMRR = stageLeads.reduce((s: number, l: any) => s + (l.estimated_mrr || 0), 0);
              const color = stageColors[stage];
              return (
                <div key={stage} className="min-w-[260px] flex-shrink-0 flex flex-col h-full">
                  <div className="mb-2 px-1">
                    <div className="flex items-center gap-2">
                      {color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />}
                      <h3 className="text-sm font-heading font-semibold">{stageLabels[stage] || stage}</h3>
                      <span className="text-xs bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">{stageLeads.length}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">R$ {stageMRR.toLocaleString("pt-BR")} MRR</p>
                  </div>
                  <Droppable droppableId={stage}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 rounded-lg p-2 min-h-[120px] flex-1 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/30"}`}
                      >
                        {stageLeads.map((lead, index) => {
                          const isPending = lead.stage === PENDING_STRIPE;
                          const wonStage = stages.find((s) => s.is_won)?.slug || "ganho";
                          return (
                          <Draggable key={lead.id} draggableId={lead.id} index={index} isDragDisabled={isPending}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onDoubleClick={() => setEditingOpp(lead)}
                              >
                                <Card className={`transition-shadow ${isPending ? "border-warning/60 bg-warning/5 cursor-default" : "cursor-grab active:cursor-grabbing"} ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/40" : "hover:shadow-md"}`}>
                                  <CardContent className="p-3 space-y-1.5">
                                    <p className="font-medium text-sm">{lead.title || lead.name}</p>
                                    {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                                    {(lead.phone || lead.contacts?.phone) && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Phone className="h-3 w-3" /> {lead.phone || lead.contacts?.phone}
                                      </p>
                                    )}
                                    <div className="flex items-center justify-between mt-1 text-xs">
                                      <span className="text-primary font-medium">R$ {(lead.estimated_mrr || 0).toLocaleString("pt-BR")}</span>
                                      <span className="text-muted-foreground">{ORIGIN_LABELS[lead.origin] || lead.origin}</span>
                                    </div>
                                    {(() => {
                                      const ids = (tagMap as Record<string, string[]>)[lead.id] || [];
                                      const visible = ids.slice(0, 3).map((id) => tagsById.get(id)).filter(Boolean);
                                      const extra = ids.length - visible.length;
                                      if (visible.length === 0) return null;
                                      return (
                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                          {visible.map((t) => (
                                            <TagChip key={t!.id} tag={t!} size="xs" />
                                          ))}
                                          {extra > 0 && (
                                            <span className="text-[10px] text-muted-foreground self-center">+{extra}</span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                                      <span>Criado: {format(new Date((lead as any).opportunity_created_at || lead.created_at), "dd/MM")}</span>
                                      {(lead as any).converted_at && (
                                        <span className="text-success">✓ {format(new Date((lead as any).converted_at), "dd/MM")}</span>
                                      )}
                                    </div>
                                    {isPending && (
                                      <StripePendingActions
                                        opportunityId={lead.id}
                                        stripeEmail={(lead as any).contacts?.email || (lead as any).contact?.email}
                                        stripePriceId={(lead as any).stripe_price_id}
                                        stripeMrr={lead.estimated_mrr}
                                        pendingSince={(lead as any).stripe_pending_since}
                                        wonSlug={wonStage}
                                        onChanged={loadData}
                                      />
                                    )}
                                  </CardContent>
                                </Card>
                              </div>
                            )}
                          </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
            </div>
          </div>
        </DragDropContext>

        <EditOpportunityDialog
          opportunity={editingOpp}
          open={!!editingOpp}
          onOpenChange={(open) => { if (!open) setEditingOpp(null); }}
          stageOrder={stageOrder}
          stageLabels={stageLabels}
          profiles={profiles}
          onUpdated={loadData}
        />
      </div>
    </Layout>
  );
}
