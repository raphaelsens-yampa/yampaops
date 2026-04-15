import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ORIGIN_LABELS, STAGE_WEIGHTS } from "@/lib/constants";
import { MetricCard } from "@/components/MetricCard";
import { GoalsProgress } from "@/components/GoalsProgress";
import { KanbanColumn } from "@/components/KanbanColumn";
import { Plus, MessageSquare, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

export default function SellerKanban() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { stages, stageOrder, stageLabels, stageColors, wonStage, lostStage, loading: stagesLoading } = usePipelineStages();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string>("mensagem_enviada");
  const [activityNotes, setActivityNotes] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [nlName, setNlName] = useState("");
  const [nlCompany, setNlCompany] = useState("");
  const [nlOrigin, setNlOrigin] = useState<string>("freetrial");
  const [nlMrr, setNlMrr] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    const [leadsRes, goalsRes] = await Promise.all([
      supabase.from("leads").select("*").eq("consultant_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("goals").select("*").eq("user_id", user!.id),
    ]);
    setLeads(leadsRes.data || []);
    setGoals(goalsRes.data || []);
    setLoading(false);
  }

  async function createLead() {
    if (!nlName || !user) return;
    const { error } = await supabase.from("leads").insert({
      name: nlName, company: nlCompany || null, origin: nlOrigin as any,
      consultant_id: user.id, estimated_mrr: parseFloat(nlMrr) || 0,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setNewLeadOpen(false);
    setNlName(""); setNlCompany(""); setNlMrr("");
    loadData();
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    let newStage: string = over.id as string;

    // If dropped over a card, find that card's stage
    if (!stageOrder.includes(newStage)) {
      const overLead = leads.find(l => l.id === newStage);
      if (overLead) newStage = overLead.stage;
      else return;
    }

    const currentLead = leads.find(l => l.id === leadId);
    if (!currentLead || currentLead.stage === newStage) return;

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage as any } : l));

    const { error } = await supabase.from("leads").update({
      stage: newStage as any,
      last_interaction_at: new Date().toISOString(),
    }).eq("id", leadId);

    if (error) {
      toast({ title: "Erro ao mover", description: error.message, variant: "destructive" });
      loadData();
    }
  }, [leads, stageOrder, toast]);

  async function logActivity(leadId: string) {
    if (!user) return;
    await supabase.from("activities").insert({
      lead_id: leadId, user_id: user.id, type: activityType as any, notes: activityNotes || null,
    });
    await supabase.from("leads").update({ last_interaction_at: new Date().toISOString() }).eq("id", leadId);
    setActivityOpen(null);
    setActivityNotes("");
    toast({ title: "Atividade registrada" });
  }

  const wonSlug = wonStage?.slug || "fechado_won";
  const lostSlug = lostStage?.slug || "perdido";
  const activeLeads = leads.filter(l => l.stage !== wonSlug && l.stage !== lostSlug);
  const wonLeads = leads.filter(l => l.stage === wonSlug);
  const closedMRR = wonLeads.reduce((s, l) => s + (l.estimated_mrr || 0), 0);

  const now = new Date();
  const currentGoals = goals.filter(g => new Date(g.period_start) <= now && new Date(g.period_end) >= now);
  const goalsData = currentGoals.map(g => ({
    channel: g.channel, target_mrr: g.target_mrr || 0,
    achieved_mrr: closedMRR,
    weighted_pipeline: activeLeads.reduce((s, l) => s + (l.estimated_mrr || 0) * (STAGE_WEIGHTS[l.stage] || 0), 0),
  }));

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const needsFollowUp = activeLeads.filter(l => {
    const last = new Date(l.last_interaction_at || l.created_at).getTime();
    return last < oneDayAgo;
  });

  if (loading || stagesLoading) {
    return <Layout><div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Meu Pipeline</h1>
          <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Novo Lead</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Nome" value={nlName} onChange={e => setNlName(e.target.value)} />
                <Input placeholder="Empresa" value={nlCompany} onChange={e => setNlCompany(e.target.value)} />
                <Select value={nlOrigin} onValueChange={setNlOrigin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORIGIN_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="MRR Estimado" value={nlMrr} onChange={e => setNlMrr(e.target.value)} />
                <Button onClick={createLead} className="w-full">Criar Lead</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard title="Leads Ativos" value={activeLeads.length} icon={<GripVertical className="h-5 w-5" />} />
          <MetricCard title="MRR Fechado" value={`R$ ${closedMRR.toLocaleString("pt-BR")}`} icon={<Plus className="h-5 w-5" />} />
          <MetricCard title="Follow-up Pendente" value={needsFollowUp.length} icon={<MessageSquare className="h-5 w-5" />} subtitle="sem interação 24h+" />
        </div>

        {goalsData.length > 0 && <GoalsProgress goals={goalsData} />}

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stageOrder.map(stage => (
              <KanbanColumn
                key={stage}
                stage={stage}
                stageName={stageLabels[stage] || stage}
                stageColor={stageColors[stage]}
                leads={leads.filter(l => l.stage === stage)}
                activityOpen={activityOpen}
                setActivityOpen={setActivityOpen}
                activityType={activityType}
                setActivityType={setActivityType}
                activityNotes={activityNotes}
                setActivityNotes={setActivityNotes}
                onLogActivity={logActivity}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDragId ? (
              <div className="bg-card border rounded-lg p-3 shadow-xl opacity-90 w-[240px]">
                <p className="font-medium text-sm">{leads.find(l => l.id === activeDragId)?.name}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </Layout>
  );
}
