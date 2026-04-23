import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { StageManager } from "@/components/StageManager";
import { NewOpportunityDialog } from "@/components/NewOpportunityDialog";
import { PipelineManager } from "@/components/PipelineManager";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useToast } from "@/hooks/use-toast";
import { EditOpportunityDialog } from "@/components/EditOpportunityDialog";
import { StripePendingActions } from "@/components/StripePendingActions";

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
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<any | null>(null);

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
    const [leadsRes, profsRes] = await Promise.all([
      supabase.from("opportunities").select("*, contacts:contact_id(name, company)").eq("pipeline_id", currentPipelineId),
      supabase.from("profiles").select("*"),
    ]);
    setLeads(leadsRes.data || []);
    setProfiles(profsRes.data || []);
    setLoading(false);
  }, [currentPipelineId]);

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

  const filtered = filter === "all" ? leads : leads.filter(l => l.origin === filter);

  if (loading || stagesLoading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  const currentPipeline = pipelines.find(p => p.id === currentPipelineId);

  return (
    <Layout>
      <div className="space-y-6">
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
          </div>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stageOrder.map(stage => {
              const stageLeads = filtered.filter(l => l.stage === stage);
              const stageMRR = stageLeads.reduce((s: number, l: any) => s + (l.estimated_mrr || 0), 0);
              const color = stageColors[stage];
              return (
                <div key={stage} className="min-w-[260px] flex-shrink-0">
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
                        className={`space-y-2 rounded-lg p-2 min-h-[120px] transition-colors ${snapshot.isDraggingOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/30"}`}
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
                                  <CardContent className="p-3 space-y-1">
                                    <p className="font-medium text-sm">{lead.title || lead.name}</p>
                                    {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                                    <div className="flex items-center justify-between mt-1 text-xs">
                                      <span className="text-primary font-medium">R$ {(lead.estimated_mrr || 0).toLocaleString("pt-BR")}</span>
                                      <span className="text-muted-foreground">{ORIGIN_LABELS[lead.origin] || lead.origin}</span>
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
