import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineStage {
  id: string;
  name: string;
  slug: string;
  position: number;
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
}

let cachedStages: PipelineStage[] | null = null;
let cachePromise: Promise<PipelineStage[]> | null = null;

async function fetchStages(): Promise<PipelineStage[]> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position", { ascending: true });
  cachedStages = (data as PipelineStage[]) || [];
  return cachedStages;
}

export function invalidateStagesCache() {
  cachedStages = null;
  cachePromise = null;
}

export function usePipelineStages() {
  const [stages, setStages] = useState<PipelineStage[]>(cachedStages || []);
  const [loading, setLoading] = useState(!cachedStages);

  useEffect(() => {
    if (cachedStages) {
      setStages(cachedStages);
      setLoading(false);
      return;
    }
    if (!cachePromise) cachePromise = fetchStages();
    cachePromise.then((s) => {
      setStages(s);
      setLoading(false);
    });
  }, []);

  const refetch = async () => {
    invalidateStagesCache();
    const s = await fetchStages();
    setStages(s);
  };

  // Derived helpers
  const stageOrder = stages.map((s) => s.slug);
  const stageLabels: Record<string, string> = {};
  const stageColors: Record<string, string> = {};
  stages.forEach((s) => {
    stageLabels[s.slug] = s.name;
    if (s.color) stageColors[s.slug] = s.color;
  });
  const activeStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);

  return {
    stages,
    loading,
    refetch,
    stageOrder,
    stageLabels,
    stageColors,
    activeStages,
    wonStage,
    lostStage,
  };
}
