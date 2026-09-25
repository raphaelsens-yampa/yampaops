import { useCallback, useEffect, useState } from "react";
import { useDb } from "@/integrations/dbContext";
import type { GrowthBaseline } from "@/lib/goalScenario";

export const GROWTH_BASELINES_EVENT = "goal-growth-baselines-change";

type GrowthBaselineRow = GrowthBaseline & { id: string; effective_month: string; note: string | null };

export function useGrowthBaselines() {
  const [baselines, setBaselines] = useState<GrowthBaselineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useDb();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("goal_growth_baselines")
      .select("id, effective_month, growth_pct, note, created_at, updated_at")
      .order("effective_month", { ascending: true });
    setBaselines((data as GrowthBaselineRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    const sync = () => void load();
    window.addEventListener(GROWTH_BASELINES_EVENT, sync);
    return () => window.removeEventListener(GROWTH_BASELINES_EVENT, sync);
  }, [load]);

  return { baselines, loading, reload: load };
}

export function notifyGrowthBaselinesChanged() {
  window.dispatchEvent(new Event(GROWTH_BASELINES_EVENT));
}
