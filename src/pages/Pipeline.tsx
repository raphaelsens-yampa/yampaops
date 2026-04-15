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

export default function PipelinePage() {
  const { role } = useAuth();
  const { stages, stageOrder, stageLabels, stageColors, loading: stagesLoading, refetch } = usePipelineStages();
  const [leads, setLeads] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  const loadData = useCallback(async () => {
    const [leadsRes, profsRes] = await Promise.all([
      supabase.from("opportunities").select("*, profiles:consultant_id(full_name)"),
      supabase.from("profiles").select("*"),
    ]);
    setLeads(leadsRes.data || []);
    setProfiles(profsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = filter === "all" ? leads : leads.filter(l => l.origin === filter);

  if (loading || stagesLoading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Pipeline</h1>
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <>
                <NewOpportunityDialog
                  profiles={profiles}
                  stageOrder={stageOrder}
                  stageLabels={stageLabels}
                  onCreated={loadData}
                />
                <Dialog open={manageOpen} onOpenChange={setManageOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-1" /> Gerenciar Etapas
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

        <div className="flex gap-4 overflow-x-auto pb-4">
          {stageOrder.map(stage => {
            const stageLeads = filtered.filter(l => l.stage === stage);
            const stageMRR = stageLeads.reduce((s: number, l: any) => s + (l.estimated_mrr || 0), 0);
            const color = stageColors[stage];
            return (
              <div key={stage} className="min-w-[250px] flex-shrink-0">
                <div className="mb-2 px-1">
                  <div className="flex items-center gap-2">
                    {color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />}
                    <h3 className="text-sm font-heading font-semibold">{stageLabels[stage] || stage}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{stageLeads.length} oportunidades · R$ {stageMRR.toLocaleString("pt-BR")}</p>
                </div>
                <div className="space-y-2 bg-muted/30 rounded-lg p-2 min-h-[100px]">
                  {stageLeads.map(lead => (
                    <Card key={lead.id}>
                      <CardContent className="p-3">
                        <p className="font-medium text-sm">{lead.title || lead.name}</p>
                        {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                        <div className="flex items-center justify-between mt-1 text-xs">
                          <span className="text-primary font-medium">R$ {(lead.estimated_mrr || 0).toLocaleString("pt-BR")}</span>
                          <span className="text-muted-foreground">{ORIGIN_LABELS[lead.origin] || lead.origin}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
