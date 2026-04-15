import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { ConversionRates } from "@/components/forecast/ConversionRates";
import { GapToGoal } from "@/components/forecast/GapToGoal";
import { ScenarioAnalysis } from "@/components/forecast/ScenarioAnalysis";
import { supabase } from "@/integrations/supabase/client";
import { FUNNEL_TRANSITIONS } from "@/lib/constants";
import type { Database } from "@/integrations/supabase/types";

type LeadStage = Database["public"]["Enums"]["lead_stage"];

export default function Forecast() {
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [actualRates, setActualRates] = useState<Record<string, number | null>>({});
  const [targetDeals, setTargetDeals] = useState(0);
  const [targetMrr, setTargetMrr] = useState(0);
  const [currentWon, setCurrentWon] = useState(0);
  const [currentMrr, setCurrentMrr] = useState(0);
  const [sellerCount, setSellerCount] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [leadsRes, goalsRes, sellersRes] = await Promise.all([
        supabase.from("leads").select("stage, estimated_mrr"),
        supabase.from("goals").select("target_deals, target_mrr"),
        supabase.from("profiles").select("user_id"),
      ]);

      const leads = leadsRes.data ?? [];
      const goals = goalsRes.data ?? [];
      const sellers = sellersRes.data ?? [];

      setSellerCount(Math.max(1, sellers.length));

      // Count leads per stage
      const counts: Record<string, number> = {};
      let wonCount = 0;
      let wonMrr = 0;

      leads.forEach((l) => {
        counts[l.stage] = (counts[l.stage] || 0) + 1;
        if (l.stage === "fechado_won") {
          wonCount++;
          wonMrr += Number(l.estimated_mrr ?? 0);
        }
      });
      setStageCounts(counts);
      setCurrentWon(wonCount);
      setCurrentMrr(wonMrr);

      // Sum goals
      const totalTargetDeals = goals.reduce((s, g) => s + (g.target_deals ?? 0), 0);
      const totalTargetMrr = goals.reduce((s, g) => s + Number(g.target_mrr ?? 0), 0);
      setTargetDeals(totalTargetDeals || 10); // default 10 if no goals set
      setTargetMrr(totalTargetMrr || 50000);

      // Calculate actual conversion rates
      // We use cumulative stage counts: leads that reached stage X includes those who moved past it
      const stageOrder: LeadStage[] = [
        "novo_lead", "contato_realizado", "diagnostico",
        "proposta_enviada", "negociacao", "fechado_won",
      ];

      // Cumulative: count of leads that reached at least stage X
      const cumulative: Record<string, number> = {};
      let runningTotal = 0;
      for (let i = stageOrder.length - 1; i >= 0; i--) {
        runningTotal += counts[stageOrder[i]] || 0;
        cumulative[stageOrder[i]] = runningTotal;
      }
      // Add perdido to novo_lead cumulative (they entered the funnel)
      cumulative["novo_lead"] = (cumulative["novo_lead"] || 0) + (counts["perdido"] || 0);

      const rates: Record<string, number | null> = {};
      FUNNEL_TRANSITIONS.forEach((t) => {
        const fromCum = cumulative[t.from] ?? 0;
        let toCum = cumulative[t.to] ?? 0;
        if (fromCum === 0) {
          rates[t.key] = null;
        } else {
          rates[t.key] = toCum / fromCum;
        }
      });
      setActualRates(rates);
    } catch (err) {
      console.error("Forecast data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
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

        <ConversionRates actualRates={actualRates} stageCounts={stageCounts} />

        <GapToGoal
          targetDeals={targetDeals}
          targetMrr={targetMrr}
          currentWon={currentWon}
          currentMrr={currentMrr}
          actualRates={actualRates}
          stageCounts={stageCounts}
        />

        <ScenarioAnalysis
          actualRates={actualRates}
          stageCounts={stageCounts}
          sellerCount={sellerCount}
        />
      </div>
    </Layout>
  );
}
