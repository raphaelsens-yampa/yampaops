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
  pipeline_id: string;
}

export function usePipelineStages(pipelineId?: string) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStages = async () => {
    let query = supabase
      .from("pipeline_stages")
      .select("*")
      .order("position", { ascending: true });
    if (pipelineId) {
      query = query.eq("pipeline_id", pipelineId);
    }
    const { data } = await query;
    setStages((data as PipelineStage[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchStages();
  }, [pipelineId]);

  const refetch = async () => {
    await fetchStages();
  };

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
