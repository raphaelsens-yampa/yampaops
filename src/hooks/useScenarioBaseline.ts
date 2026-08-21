import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ScenarioBaseline } from "@/lib/goalScenario";

const TOTAL_MRR_SLUG = "total_de_mrr_ms3g6o38";

let cache: Promise<ScenarioBaseline | null> | null = null;

async function fetchBaseline(): Promise<ScenarioBaseline | null> {
  const { data: cats } = await supabase
    .from("goal_categories")
    .select("id, slug")
    .eq("slug", TOTAL_MRR_SLUG)
    .limit(1);
  const catId = ((cats as any[]) || [])[0]?.id;
  if (!catId) return null;
  const { data } = await supabase
    .from("metabase_monthly_agg")
    .select("year_month, realized_amount")
    .eq("category_id", catId)
    .order("year_month", { ascending: false })
    .limit(24);
  const rows = ((data as any[]) || []).filter((r) => Number(r.realized_amount || 0) > 0);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Último mês FECHADO (o mês vigente ainda está em curso)
  const closed = rows.find((r) => String(r.year_month).slice(0, 7) < currentMonth);
  if (!closed) return null;
  return { month: String(closed.year_month).slice(0, 7), value: Number(closed.realized_amount) };
}

/**
 * Âncora dos cenários de crescimento: último mês fechado com Total de MRR
 * realizado. Metas até esse mês nunca são alteradas pela simulação.
 */
export function useScenarioBaseline(): ScenarioBaseline | null {
  const [baseline, setBaseline] = useState<ScenarioBaseline | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!cache) cache = fetchBaseline();
    cache.then((b) => {
      if (!cancelled) setBaseline(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return baseline;
}
