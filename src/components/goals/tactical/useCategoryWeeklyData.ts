import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GoalCategory } from "@/lib/goalCategories";
import { VIRTUAL_MRR_RECOVERY, VIRTUAL_MRR_RETENTION, VIRTUAL_MRR_SALES } from "./useTacticalData";
import { applyScenarioToGoals } from "@/lib/goalScenario";
import { useGoalScenario } from "@/hooks/useGoalScenario";
import {
  buildOriginShares,
  CATEGORY_SLUG_TO_CLASSIFICATION,
  isOriginFiltered,
  originShareAsOf,
  type OriginFilter,
} from "@/lib/origins";

/** Categorias exclusivas da conta yampa 2.0 — nunca viram linha própria aqui. */
const YAMPA20_MRR_CAT = "736013b8-a8d9-4cb7-9853-116278e00a6d";
const YAMPA20_ACTIVE_CAT = "4f7772b8-1dcd-4e92-89bc-23fac2a57fa2";
const YAMPA20_CATEGORY_IDS = new Set([YAMPA20_MRR_CAT, YAMPA20_ACTIVE_CAT]);
/** Categorias do yampaFin que recebem o 2.0 quando "Incluir 2.0" está ativo. */
const BASE_MRR_CAT = "9bf2da79-f47f-4215-b841-bbb3e91ee036";
const BASE_ACTIVE_CAT = "b70ca504-9f35-40b6-807b-e830c6342ac7";
/** Net MRR é FLUXO: recebe a VARIAÇÃO do estoque de MRR do 2.0 no período. */
const NET_MRR_CAT = "259883ec-7be5-44cd-927f-947b12918da7";


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
  /** Soma a conta yampa 2.0 em MRR/Ativos e a variação do 2.0 no Net MRR. */
  includeYampa20 = false,
): CategoryWeeklyData {
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [targets, setTargets] = useState<Map<string, number>>(new Map());
  const [series, setSeries] = useState<Map<string, CategorySnapPoint[]>>(new Map());
  const [noOriginSplit, setNoOriginSplit] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  /** Cenário de crescimento simulado (0 = metas cadastradas). */
  const { growthPct: scenarioPct } = useGoalScenario();

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
      // Cenário de crescimento eleva as metas em memória (nada muda no banco).
      const scenarioGoals = applyScenarioToGoals(
        ((goalsRes.data as any[]) || []) as any[],
        ((catRes.data as any[]) || []) as any[],
        scenarioPct,
      );
      for (const g of scenarioGoals) {
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

      /**
       * "Incluir 2.0": soma a conta yampa 2.0 na leitura (nada muda no banco).
       * - MRR e Ativos Pagantes são ESTOQUE → soma no mesmo dia.
       * - Net MRR é FLUXO → entra a VARIAÇÃO do estoque de MRR do 2.0 em relação
       *   ao fechamento do mês anterior, exatamente como no Acompanhamento.
       * Sem recorte por origem (a base do 2.0 não tem origem por price ID).
       */
      if (includeYampa20 && !shares) {
        const mrr20 = new Map<string, number>();
        const act20 = new Map<string, number>();
        for (const row of (snapRes.data as any[]) || []) {
          if (row.category_id === YAMPA20_MRR_CAT) {
            mrr20.set(row.data as string, Number(row.realized_amount ?? 0));
          } else if (row.category_id === YAMPA20_ACTIVE_CAT) {
            act20.set(row.data as string, Number(row.deals_count ?? 0));
          }
        }
        const addTo = (catId: string, extra: (date: string) => number | null) => {
          const list = s.get(catId);
          if (!list) return;
          s.set(
            catId,
            list.map((p) => {
              const add = extra(p.date);
              return add === null ? p : { ...p, value: p.value + add };
            }),
          );
        };
        addTo(BASE_MRR_CAT, (d) => mrr20.get(d) ?? null);
        addTo(BASE_ACTIVE_CAT, (d) => act20.get(d) ?? null);
        const baseline = mrr20.get(prevEndKey) ?? null;
        addTo(NET_MRR_CAT, (d) => {
          if (baseline === null) return null;
          const level = mrr20.get(d);
          return level === undefined ? null : level - baseline;
        });
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
  }, [refDate.getFullYear(), refDate.getMonth(), refreshKey, origin, includeYampa20, scenarioPct]);

  return { categories, targets, series, noOriginSplit, loading };
}
