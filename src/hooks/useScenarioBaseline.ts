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
  // Base = realizado do mês IMEDIATAMENTE ANTERIOR ao mês vigente.
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const anchor = rows.find((r) => String(r.year_month).slice(0, 7) === previousMonth);
  // Se ainda não houver dado para o mês anterior, usa o último realizado disponível.
  const fallback = rows.find((r) => String(r.year_month).slice(0, 7) < currentMonth);
  const selected = anchor ?? fallback;
  if (!selected) return null;
  return { month: String(selected.year_month).slice(0, 7), value: Number(selected.realized_amount) };
}

/**
 * Âncora dos cenários de crescimento: realizado do mês anterior ao primeiro mês
 * projetado (Total de MRR). Metas até esse mês nunca são alteradas.
 * Os meses seguintes compõem sobre o PROJETADO do mês anterior.
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
