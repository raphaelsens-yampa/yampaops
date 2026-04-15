import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { STAGE_LABELS, STAGE_ORDER, ACTIVE_STAGES, ORIGIN_LABELS, ACTIVITY_LABELS, STAGE_WEIGHTS } from "@/lib/constants";
import { MetricCard } from "@/components/MetricCard";
import { GoalsProgress } from "@/components/GoalsProgress";
import { Plus, MessageSquare, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadStage = Database["public"]["Enums"]["lead_stage"];

export default function SellerKanban() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string>("mensagem_enviada");
  const [activityNotes, setActivityNotes] = useState("");

  // New lead form
  const [nlName, setNlName] = useState("");
  const [nlCompany, setNlCompany] = useState("");
  const [nlOrigin, setNlOrigin] = useState<string>("freetrial");
  const [nlMrr, setNlMrr] = useState("");

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

  async function moveStage(leadId: string, newStage: LeadStage) {
    await supabase.from("leads").update({ stage: newStage, last_interaction_at: new Date().toISOString() }).eq("id", leadId);
    loadData();
  }

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

  // Personal metrics
  const activeLeads = leads.filter(l => !["fechado_won", "perdido"].includes(l.stage));
  const wonLeads = leads.filter(l => l.stage === "fechado_won");
  const closedMRR = wonLeads.reduce((s, l) => s + (l.estimated_mrr || 0), 0);

  // Goals
  const now = new Date();
  const currentGoals = goals.filter(g => new Date(g.period_start) <= now && new Date(g.period_end) >= now);
  const goalsData = currentGoals.map(g => ({
    channel: g.channel, target_mrr: g.target_mrr || 0,
    achieved_mrr: closedMRR,
    weighted_pipeline: activeLeads.reduce((s, l) => s + (l.estimated_mrr || 0) * (STAGE_WEIGHTS[l.stage] || 0), 0),
  }));

  // Daily checklist: leads with no interaction in 24h+
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const needsFollowUp = activeLeads.filter(l => {
    const last = new Date(l.last_interaction_at || l.created_at).getTime();
    return last < oneDayAgo;
  });

  if (loading) {
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

        {/* Personal metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard title="Leads Ativos" value={activeLeads.length} icon={<GripVertical className="h-5 w-5" />} />
          <MetricCard title="MRR Fechado" value={`R$ ${closedMRR.toLocaleString("pt-BR")}`} icon={<Plus className="h-5 w-5" />} />
          <MetricCard title="Follow-up Pendente" value={needsFollowUp.length} icon={<MessageSquare className="h-5 w-5" />} subtitle="sem interação 24h+" />
        </div>

        {/* Goals */}
        {goalsData.length > 0 && <GoalsProgress goals={goalsData} />}

        {/* Kanban */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_ORDER.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage);
            return (
              <div key={stage} className="min-w-[260px] flex-shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-heading font-semibold">{STAGE_LABELS[stage]}</h3>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{stageLeads.length}</span>
                </div>
                <div className="space-y-2 bg-muted/30 rounded-lg p-2 min-h-[120px]">
                  {stageLeads.map(lead => {
                    const daysSince = Math.floor((Date.now() - new Date(lead.last_interaction_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <Card key={lead.id} className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="p-3 space-y-2">
                          <div>
                            <p className="font-medium text-sm">{lead.name}</p>
                            {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-primary font-medium">R$ {(lead.estimated_mrr || 0).toLocaleString("pt-BR")}</span>
                            <span className={`${daysSince >= 2 ? "text-destructive" : "text-muted-foreground"}`}>{daysSince}d</span>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {/* Stage movement buttons */}
                            {stage !== "fechado_won" && stage !== "perdido" && (
                              <Select onValueChange={(v) => moveStage(lead.id, v as LeadStage)}>
                                <SelectTrigger className="h-7 text-xs w-full">
                                  <SelectValue placeholder="Mover →" />
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGE_ORDER.filter(s => s !== stage).map(s => (
                                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          {/* Activity button */}
                          <Dialog open={activityOpen === lead.id} onOpenChange={(open) => setActivityOpen(open ? lead.id : null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="w-full h-7 text-xs">
                                <MessageSquare className="h-3 w-3 mr-1" /> Registrar Atividade
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Registrar Atividade</DialogTitle></DialogHeader>
                              <div className="space-y-3">
                                <Select value={activityType} onValueChange={setActivityType}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                                      <SelectItem key={k} value={k}>{v}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Textarea placeholder="Notas..." value={activityNotes} onChange={e => setActivityNotes(e.target.value)} />
                                <Button onClick={() => logActivity(lead.id)} className="w-full">Salvar</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
