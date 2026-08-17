import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GoalCategory } from "@/lib/goalCategories";
import { VIRTUAL_MRR_RECOVERY, VIRTUAL_MRR_RETENTION, VIRTUAL_MRR_SALES } from "./useTacticalData";
import {
  buildOriginShares,
  CATEGORY_SLUG_TO_CLASSIFICATION,
  isOriginFiltered,
  originShareAsOf,
  type OriginFilter,
} from "@/lib/origins";

/** Categorias exclusivas da conta yampa 2.0 — não entram nesta visão. */
const YAMPA20_CATEGORY_IDS = new Set([
  "736013b8-a8d9-4cb7-9853-116278e00a6d",
  "4f7772b8-1dcd-4e92-89bc-23fac2a57fa2",
]);

/**
 * Categorias cujo realizado é de ESTOQUE (nível no fim do período) e não de
 * fluxo acumulado no mês. Para elas a semana mostra o nível do último dia com
 * snapshot, nunca a variação.
 */
export const STOCK_CATEGORY_SLUGS = new Set([
  "total_de_mrr_ms3g6o38",
  "usuarios_ativos_pagantes_ms8yyce5",
  "churn-rate-logos",
]);

/** Categoria → métrica tática (realizado em tempo real). */
export const CATEGORY_TACTICAL_METRIC: Record<string, string> = {
  new_mrr: VIRTUAL_MRR_SALES,
  recuperados: VIRTUAL_MRR_RECOVERY,
  retencao: VIRTUAL_MRR_RETENTION,
};

export interface CategoryMonthGoal {
  category_id: string;
  target: number;
}

export interface CategorySnapPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export interface CategoryWeeklyData {
  categories: GoalCategory[];
  /** category_id -> meta do mês de referência */
  targets: Map<string, number>;
  /** category_id -> série diária (asc) do mês, incluindo o último dia do mês anterior */
  series: Map<string, CategorySnapPoint[]>;
  /** categorias sem recorte por origem na base (só aparecem na Visão Geral) */
  noOriginSplit: Set<string>;
  loading: boolean;
}

function monthBounds(ref: Date) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startKey: key(start), endKey: key(end), prevEndKey: key(prevEnd) };
}

/** Valor do snapshot conforme o tipo da categoria. */
function snapValue(row: any, category?: GoalCategory): number {
  if (category?.metric_type === "count") return Number(row.deals_count ?? 0);
  return Number(row.realized_amount ?? 0);
}

export function useCategoryWeeklyData(
  refDate: Date,
  refreshKey = 0,
  origin: OriginFilter = "all",
): CategoryWeeklyData {
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [targets, setTargets] = useState<Map<string, number>>(new Map());
  const [series, setSeries] = useState<Map<string, CategorySnapPoint[]>>(new Map());
  const [noOriginSplit, setNoOriginSplit] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { startKey, endKey, prevEndKey } = monthBounds(refDate);

      const originFiltered = isOriginFiltered(origin);
      const [catRes, goalsRes, snapRes, originRes] = await Promise.all([
        supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name"),
        supabase
          .from("goals")
          .select("category_id, target_mrr, target_deals, target_tpv, target_pct, period_start, period_end")
          .lte("period_start", endKey)
          .gte("period_end", startKey),
        supabase
          .from("metas_snapshot_diario")
          .select("data, category_id, realized_amount, deals_count")
          .gte("data", prevEndKey)
          .lte("data", endKey)
          .order("data", { ascending: true }),
        originFiltered
          ? supabase
              .from("metas_price_daily")
              .select("data, classificacao, origem_cliente, qtd_mtd, mrr_mtd")
              .lte("data", endKey)
              .not("origem_cliente", "is", null)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const cats = (((catRes.data as GoalCategory[]) || []) as GoalCategory[]).filter(
        (c) => !YAMPA20_CATEGORY_IDS.has(c.id),
      );
      const byId = new Map(cats.map((c) => [c.id, c]));

      const t = new Map<string, number>();
      for (const g of (goalsRes.data as any[]) || []) {
        if (!g.category_id) continue;
        const value =
          Number(g.target_pct || 0) ||
          Number(g.target_mrr || 0) ||
          Number(g.target_deals || 0) ||
          Number(g.target_tpv || 0);
        if (!value) continue;
        t.set(g.category_id, Math.max(t.get(g.category_id) ?? 0, value));
      }

      // Recorte por origem: `metas_snapshot_diario` não tem origem, então o
      // realizado é rateado pela PARTICIPAÇÃO da origem em `metas_price_daily`.
      // Categorias sem classificação correspondente (Churn de MRR, Churn %,
      // Total de MRR, Ativos) não têm recorte e ficam indisponíveis.
      const shares = originFiltered
        ? buildOriginShares(((originRes as any).data as any[]) || [], origin)
        : null;
      const unsupported = new Set<string>();

      const s = new Map<string, CategorySnapPoint[]>();
      for (const row of (snapRes.data as any[]) || []) {
        if (!row.category_id) continue;
        const cat = byId.get(row.category_id);
        let value = snapValue(row, cat);
        if (shares) {
          const cls = cat ? CATEGORY_SLUG_TO_CLASSIFICATION[cat.slug] : undefined;
          if (!cls) {
            unsupported.add(row.category_id as string);
            continue;
          }
          const share = originShareAsOf(
            shares,
            row.data as string,
            cls,
            cat?.metric_type === "count" ? "qtd" : "mrr",
          );
          if (share === null) {
            unsupported.add(row.category_id as string);
            continue;
          }
          value = value * share;
        }
        const list = s.get(row.category_id) ?? [];
        list.push({ date: row.data as string, value });
        s.set(row.category_id, list);
      }
      if (shares) {
        for (const c of cats) {
          if (!CATEGORY_SLUG_TO_CLASSIFICATION[c.slug] && !(c.component_category_ids ?? []).length) {
            unsupported.add(c.id);
          }
        }
      }

      setCategories(cats);
      setTargets(t);
      setSeries(s);
      setNoOriginSplit(unsupported);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refDate.getFullYear(), refDate.getMonth(), refreshKey, origin]);

  return { categories, targets, series, noOriginSplit, loading };
}
