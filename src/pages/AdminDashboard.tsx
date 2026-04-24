import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { MetricCard } from "@/components/MetricCard";
import { PipelineFunnel } from "@/components/PipelineFunnel";
import { BottleneckAlerts } from "@/components/BottleneckAlerts";
import { Leaderboard } from "@/components/Leaderboard";
import { GoalsProgress } from "@/components/GoalsProgress";
import { STAGE_WEIGHTS } from "@/lib/constants";
import { RevenueProjection } from "@/components/RevenueProjection";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { DollarSign, TrendingUp, Users, Zap, BarChart3 } from "lucide-react";
import { SafraSelector } from "@/components/SafraSelector";

function startOfMonth(d: Date) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d: Date) { const x = startOfMonth(d); x.setMonth(x.getMonth()+1); return x; }

export default function AdminDashboard() {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(undefined);
  const { stages, stageOrder, stageLabels, wonStage, lostStage, loading: stagesLoading } = usePipelineStages(selectedPipelineId);
  const [leads, setLeads] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [safra, setSafra] = useState<Date>(startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPipelines() {
      const { data } = await supabase.from("pipelines").select("id, name").order("is_default", { ascending: false });
      const pips = data || [];
      setPipelines(pips);
      if (pips.length > 0 && !selectedPipelineId) {
        setSelectedPipelineId(pips[0].id);
      }
    }
    loadPipelines();
  }, []);

  useEffect(() => {
    async function load() {
      const [leadsRes, actsRes, goalsRes, profsRes] = await Promise.all([
        supabase.from("opportunities").select("*"),
        supabase.from("activities").select("*"),
        supabase.from("goals").select("*"),
        supabase.from("profiles").select("*"),
      ]);
      setLeads(leadsRes.data || []);
      setActivities(actsRes.data || []);
      setGoals(goalsRes.data || []);
      setProfiles(profsRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const wonSlug = wonStage?.slug || "fechado_won";
  const lostSlug = lostStage?.slug || "perdido";

  // Safra range (selected month)
  const safraStart = startOfMonth(safra).getTime();
  const safraEnd = endOfMonth(safra).getTime();
  const inSafra = (ts: number) => ts >= safraStart && ts < safraEnd;

  // Active = open opportunities created in safra month
  const activeLeads = leads.filter(l => {
    if (l.converted_at || l.stage === lostSlug || l.stage === "perdido") return false;
    const ts = new Date(l.opportunity_created_at || l.created_at).getTime();
    return inSafra(ts);
  });
  // Won = closed in safra month (by converted_at)
  const wonLeads = leads.filter(l => l.converted_at && inSafra(new Date(l.converted_at).getTime()));
  const totalPipelineMRR = activeLeads.reduce((s, l) => s + (l.estimated_mrr || 0), 0);
  const closedMRR = wonLeads.reduce((s, l) => s + (l.estimated_mrr || 0), 0);
  const totalSafraLeads = leads.filter(l => {
    if (l.stage === lostSlug || l.stage === "perdido") return false;
    const ts = new Date(l.opportunity_created_at || l.created_at).getTime();
    return inSafra(ts);
  }).length;
  const convRate = totalSafraLeads > 0 ? ((wonLeads.length / totalSafraLeads) * 100).toFixed(1) : "0";

  const wonDays = wonLeads.map(l => {
    const created = new Date(l.opportunity_created_at || l.created_at).getTime();
    const wonAt = new Date(l.converted_at || l.updated_at).getTime();
    return (wonAt - created) / (1000 * 60 * 60 * 24);
  });
  const avgVelocity = wonDays.length > 0 ? (wonDays.reduce((a, b) => a + b, 0) / wonDays.length).toFixed(1) : "—";

  // Filter leads by selected pipeline AND by safra (opportunity_created_at month)
  const pipelineLeads = (selectedPipelineId
    ? leads.filter(l => l.pipeline_id === selectedPipelineId)
    : leads
  ).filter((l: any) => {
    const ts = new Date(l.opportunity_created_at || l.created_at).getTime();
    return ts >= safraStart && ts < safraEnd;
  });

  const funnelData: Record<string, { count: number; mrr: number }> = {};
  stageOrder.forEach(s => { funnelData[s] = { count: 0, mrr: 0 }; });
  pipelineLeads.forEach(l => {
    if (funnelData[l.stage]) {
      funnelData[l.stage].count++;
      funnelData[l.stage].mrr += l.estimated_mrr || 0;
    }
  });

  const now = Date.now();
  const stagnant = activeLeads
    .map(l => {
      const last = new Date(l.last_interaction_at || l.updated_at).getTime();
      const days = Math.floor((now - last) / (1000 * 60 * 60 * 24));
      const prof = profiles.find(p => p.user_id === l.consultant_id);
      return { id: l.id, name: l.name, company: l.company, stage: l.stage, consultant_name: prof?.full_name || null, days_stuck: days };
    })
    .filter(l => l.days_stuck >= 2)
    .sort((a, b) => b.days_stuck - a.days_stuck);

  const sellerMap = new Map<string, { name: string; deals_won: number; mrr_won: number; contacts: number; meetings: number }>();
  profiles.forEach(p => sellerMap.set(p.user_id, { name: p.full_name || "—", deals_won: 0, mrr_won: 0, contacts: 0, meetings: 0 }));
  wonLeads.forEach(l => {
    const s = sellerMap.get(l.consultant_id);
    if (s) { s.deals_won++; s.mrr_won += l.estimated_mrr || 0; }
  });
  activities.forEach(a => {
    const s = sellerMap.get(a.user_id);
    if (s) {
      if (["mensagem_enviada", "call_realizada"].includes(a.type)) s.contacts++;
      if (a.type === "reuniao_executada") s.meetings++;
    }
  });

  const now_month = new Date();
  const currentGoals = goals.filter(g => {
    const start = new Date(g.period_start);
    const end = new Date(g.period_end);
    return now_month >= start && now_month <= end;
  });

  const goalsProgress = currentGoals.map(g => {
    const channelLeads = g.channel
      ? wonLeads.filter(l => l.origin === g.channel)
      : wonLeads;
    const achieved = channelLeads.reduce((s: number, l: any) => s + (l.estimated_mrr || 0), 0);
    const pipelineLeads = g.channel
      ? activeLeads.filter(l => l.origin === g.channel)
      : activeLeads;
    const weighted = pipelineLeads.reduce((s: number, l: any) => s + (l.estimated_mrr || 0) * (STAGE_WEIGHTS[l.stage] || 0), 0);
    return {
      channel: g.channel, target_mrr: g.target_mrr || 0,
      achieved_mrr: achieved, weighted_pipeline: weighted,
    };
  });

  if (loading || stagesLoading) {
    return <Layout><div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-heading font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Safra:</span>
            <SafraSelector value={safra} onChange={setSafra} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Pipeline MRR" value={`R$ ${totalPipelineMRR.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5" />} />
          <MetricCard title="MRR Fechado" value={`R$ ${closedMRR.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5" />} subtitle={safra.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} />
          <MetricCard title="Conversão" value={`${convRate}%`} icon={<BarChart3 className="h-5 w-5" />} />
          <MetricCard title="Vel. Média" value={`${avgVelocity}d`} icon={<Zap className="h-5 w-5" />} subtitle="dias até fechar" />
          <MetricCard title="Oportunidades" value={activeLeads.length} icon={<Users className="h-5 w-5" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PipelineFunnel
            data={funnelData}
            stageOrder={stageOrder}
            stageLabels={stageLabels}
            pipelines={pipelines}
            selectedPipelineId={selectedPipelineId}
            onPipelineChange={setSelectedPipelineId}
            subtitle={`Safra: ${safra.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
          />
          <GoalsProgress goals={goalsProgress} />
        </div>

        <RevenueProjection leads={leads} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Leaderboard sellers={Array.from(sellerMap.values())} />
          <BottleneckAlerts leads={stagnant} stageLabels={stageLabels} />
        </div>
      </div>
    </Layout>
  );
}
