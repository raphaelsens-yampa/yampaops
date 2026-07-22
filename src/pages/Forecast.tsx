import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { ConversionRates } from "@/components/forecast/ConversionRates";
import { GapToGoal } from "@/components/forecast/GapToGoal";
import { ScenarioAnalysis } from "@/components/forecast/ScenarioAnalysis";
import { supabase } from "@/integrations/supabase/client";
import { usePipelineStages } from "@/hooks/usePipelineStages";




export interface DynamicTransition {
  key: string;
  label: string;
  fromSlug: string;
  toSlug: string;
}

export default function Forecast() {
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [actualRates, setActualRates] = useState<Record<string, number | null>>({});
  const [targetDeals, setTargetDeals] = useState(0);
  const [targetMrr, setTargetMrr] = useState(0);
  const [currentWon, setCurrentWon] = useState(0);
  const [currentMrr, setCurrentMrr] = useState(0);
  const [sellerCount, setSellerCount] = useState(1);
  
  const [loading, setLoading] = useState(true);

  const { stages, stageOrder, stageLabels, wonStage, lostStage, loading: stagesLoading } = usePipelineStages();

  // Build dynamic transitions from consecutive active stages (excluding won/lost)
  const activeStageOrder = stageOrder.filter(
    (slug) => slug !== wonStage?.slug && slug !== lostStage?.slug
  );

  const transitions: DynamicTransition[] = [];
  // Add transitions between active stages
  for (let i = 0; i < activeStageOrder.length - 1; i++) {
    const fromSlug = activeStageOrder[i];
    const toSlug = activeStageOrder[i + 1];
    transitions.push({
      key: `${fromSlug}_to_${toSlug}`,
      label: `${stageLabels[fromSlug] || fromSlug} → ${stageLabels[toSlug] || toSlug}`,
      fromSlug,
      toSlug,
    });
  }
  // Add final transition: last active stage → won stage
  if (activeStageOrder.length > 0 && wonStage) {
    const lastActive = activeStageOrder[activeStageOrder.length - 1];
    transitions.push({
      key: `${lastActive}_to_${wonStage.slug}`,
      label: `${stageLabels[lastActive] || lastActive} → ${stageLabels[wonStage.slug] || wonStage.slug}`,
      fromSlug: lastActive,
      toSlug: wonStage.slug,
    });
  }

  useEffect(() => {
    if (!stagesLoading && stages.length > 0) {
      fetchData();
    }
  }, [stagesLoading, stages]);

  async function fetchData() {
    try {
      const [leadsRes, goalsRes, sellersRes] = await Promise.all([
        supabase.from("opportunities").select("stage, estimated_mrr"),
        supabase.from("goals").select("*"),
        supabase.from("profiles").select("user_id"),
      ]);

      const leads = (leadsRes.data ?? []) as any[];
      const goals = goalsRes.data ?? [];
      const sellers = sellersRes.data ?? [];

      setSellerCount(Math.max(1, sellers.length));

      const counts: Record<string, number> = {};
      let wonCount = 0;
      let wonMrr = 0;

      const wonSlug = wonStage?.slug;

      leads.forEach((l: any) => {
        counts[l.stage] = (counts[l.stage] || 0) + 1;
        if (wonSlug && l.stage === wonSlug) {
          wonCount++;
          wonMrr += Number(l.estimated_mrr ?? 0);
        }
      });
      setStageCounts(counts);
      setCurrentWon(wonCount);
      setCurrentMrr(wonMrr);

      const totalTargetDeals = goals.reduce((s, g) => s + (g.target_deals ?? 0), 0);
      const totalTargetMrr = goals.reduce((s, g) => s + Number(g.target_mrr ?? 0), 0);
      setTargetDeals(totalTargetDeals || 10);
      setTargetMrr(totalTargetMrr || 50000);

      const aggregated: StageGoals = { ...DEFAULT_STAGE_GOALS };
      goals.forEach((g: any) => {
        aggregated.target_prospeccoes += Number(g.target_prospeccoes ?? 0);
        aggregated.target_respostas += Number(g.target_respostas ?? 0);
        aggregated.target_agendamentos += Number(g.target_agendamentos ?? 0);
        aggregated.target_comparecimentos += Number(g.target_comparecimentos ?? 0);
        aggregated.target_conversoes += Number(g.target_conversoes ?? 0);
        if (g.target_taxa_resposta != null) aggregated.target_taxa_resposta = Number(g.target_taxa_resposta);
        if (g.target_taxa_agendamento != null) aggregated.target_taxa_agendamento = Number(g.target_taxa_agendamento);
        if (g.target_taxa_comparecimento != null) aggregated.target_taxa_comparecimento = Number(g.target_taxa_comparecimento);
        if (g.target_taxa_conversao != null) aggregated.target_taxa_conversao = Number(g.target_taxa_conversao);
      });
      setStageGoals(aggregated);

      // Build cumulative counts for rate calculation
      // Order: from last active stage backwards, accumulating
      const allSlugsInOrder = [...activeStageOrder];
      if (wonSlug) allSlugsInOrder.push(wonSlug);

      const cumulative: Record<string, number> = {};
      let runningTotal = 0;
      for (let i = allSlugsInOrder.length - 1; i >= 0; i--) {
        runningTotal += counts[allSlugsInOrder[i]] || 0;
        cumulative[allSlugsInOrder[i]] = runningTotal;
      }
      // Include lost in the first stage cumulative
      if (lostStage && allSlugsInOrder.length > 0) {
        cumulative[allSlugsInOrder[0]] = (cumulative[allSlugsInOrder[0]] || 0) + (counts[lostStage.slug] || 0);
      }

      const rates: Record<string, number | null> = {};
      transitions.forEach((t) => {
        const fromCum = cumulative[t.fromSlug] ?? 0;
        const toCum = cumulative[t.toSlug] ?? 0;
        rates[t.key] = fromCum === 0 ? null : toCum / fromCum;
      });
      setActualRates(rates);
    } catch (err) {
      console.error("Forecast data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || stagesLoading) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Carregando dados de forecast...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Forecast & Análise de Cenário</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Projeções baseadas nos seus dados reais vs. benchmarks de mercado SaaS
          </p>
        </div>

        <ConversionRates
          actualRates={actualRates}
          stageCounts={stageCounts}
          stageGoals={stageGoals}
          transitions={transitions}
          stageLabels={stageLabels}
        />

        <GapToGoal
          targetDeals={targetDeals}
          targetMrr={targetMrr}
          currentWon={currentWon}
          currentMrr={currentMrr}
          actualRates={actualRates}
          stageCounts={stageCounts}
          transitions={transitions}
          stageLabels={stageLabels}
          wonSlug={wonStage?.slug}
        />

        <ScenarioAnalysis
          actualRates={actualRates}
          stageCounts={stageCounts}
          sellerCount={sellerCount}
          transitions={transitions}
          stageLabels={stageLabels}
        />
      </div>
    </Layout>
  );
}
