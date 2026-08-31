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
  const saoPauloParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = saoPauloParts.find((part) => part.type === "year")?.value;
  const month = saoPauloParts.find((part) => part.type === "month")?.value;
  if (!year || !month) return null;
  const currentMonth = `${year}-${month}`;
  const currentMonthNumber = Number(month);
  const previousYear = currentMonthNumber === 1 ? Number(year) - 1 : Number(year);
  const previousMonthNumber = currentMonthNumber === 1 ? 12 : currentMonthNumber - 1;
  const previousMonth = `${previousYear}-${String(previousMonthNumber).padStart(2, "0")}`;
  // No último dia do mês, esse mês passa a ser a referência do próximo mês projetado.
  // Antes disso, usamos o mês imediatamente anterior ao vigente.
  const isLastDay = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
  }).format(now)) === new Date(Number(year), Number(month), 0).getDate();
  const referenceMonth = isLastDay ? currentMonth : previousMonth;
  const anchor = rows.find((r) => String(r.year_month).slice(0, 7) === referenceMonth);
  // Se ainda não houver dado para a referência, usa o último realizado disponível.
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
