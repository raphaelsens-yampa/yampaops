import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGoalScenario } from "@/hooks/useGoalScenario";
import { scenarioDailyFactor } from "@/lib/goalScenario";

/**
 * Fator do cenário de crescimento aplicado às metas DIÁRIAS táticas
 * (que não têm categoria). Segue a exigência extra de entrada de MRR do mês.
 */
export function useScenarioDailyFactor(ref: Date): number {
  const { growthPct } = useGoalScenario();
  const [factor, setFactor] = useState(1);
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;

  useEffect(() => {
    if (!growthPct) {
      setFactor(1);
      return;
    }
    let cancelled = false;
    (async () => {
      const [goalsRes, catRes] = await Promise.all([
        supabase.from("goals").select("category_id, period_start, period_end, target_mrr, target_deals, target_tpv, target_pct"),
        supabase.from("goal_categories").select("id, slug, goal_direction, component_category_ids"),
      ]);
      if (cancelled) return;
      setFactor(
        scenarioDailyFactor(
          ((goalsRes.data as any[]) || []) as any[],
          ((catRes.data as any[]) || []) as any[],
          growthPct,
          ref,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growthPct, monthKey]);

  return factor;
}
