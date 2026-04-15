import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_LABELS, STAGE_ORDER, ORIGIN_LABELS } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PipelinePage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("leads").select("*, profiles:consultant_id(full_name)").then(({ data }) => {
      setLeads(data || []);
      setLoading(false);
    });
  }, []);

  const filtered = filter === "all" ? leads : leads.filter(l => l.origin === filter);

  if (loading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Pipeline</h1>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {Object.entries(ORIGIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_ORDER.map(stage => {
            const stageLeads = filtered.filter(l => l.stage === stage);
            const stageMRR = stageLeads.reduce((s, l) => s + (l.estimated_mrr || 0), 0);
            return (
              <div key={stage} className="min-w-[250px] flex-shrink-0">
                <div className="mb-2 px-1">
                  <h3 className="text-sm font-heading font-semibold">{STAGE_LABELS[stage]}</h3>
                  <p className="text-xs text-muted-foreground">{stageLeads.length} leads · R$ {stageMRR.toLocaleString("pt-BR")}</p>
                </div>
                <div className="space-y-2 bg-muted/30 rounded-lg p-2 min-h-[100px]">
                  {stageLeads.map(lead => (
                    <Card key={lead.id}>
                      <CardContent className="p-3">
                        <p className="font-medium text-sm">{lead.name}</p>
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
