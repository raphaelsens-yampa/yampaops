import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GoalCategory } from "@/lib/goalCategories";
import { VIRTUAL_MRR_RECOVERY, VIRTUAL_MRR_RETENTION, VIRTUAL_MRR_SALES } from "./useTacticalData";
import { applyScenarioToGoals } from "@/lib/goalScenario";
import { useGoalScenario } from "@/hooks/useGoalScenario";
import { useScenarioBaseline } from "@/hooks/useScenarioBaseline";
import { useGrowthBaselines } from "@/hooks/useGrowthBaselines";
import { netMrrIncludingYampa20 } from "@/lib/netMrr";
import {
  buildOriginShares,
  CATEGORY_SLUG_TO_CLASSIFICATION,
  isOriginFiltered,
  matchesOrigin,
  originShareAsOf,
  type OriginFilter,
} from "@/lib/origins";
import {
  buildCouponShares,
  CATEGORY_SLUG_TO_COUPON_CLASS,
  couponCampaignValueBetween,
  EMPTY_COUPON_SHARES,
  fetchCampaignCouponIds,
  isCouponFiltered,
  normalizeEmail,
  splitCanonicalCouponValue,
  type CouponFilter,
  type CouponShares,
} from "./campaignCoupons";


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

/** Fluxos de MRR fechados cliente a cliente pela data real de ativação. */
export const REAL_MRR_FLOW_SLUGS = new Set(["new_mrr", "recuperados", "upsell", "downsell"]);

const REAL_MRR_CLASS_BY_SLUG: Record<string, string> = {
  new_mrr: "novo pagante",
  recuperados: "recuperado",
  upsell: "upsell",
  downsell: "downsell",
};

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
  /** participações de campanha por cupom (null quando o filtro está em "Tudo") */
  couponShares: CouponShares | null;
  /** fotografia da base cliente a cliente usada no fechamento dos fluxos de MRR */
  actualSnapshotDate: string | null;
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

/**
 * Valor do snapshot conforme o tipo da categoria.
 * `null` = snapshot existe mas sem dado para a categoria (não é zero!),
 * então o ponto é ignorado e a leitura usa o último valor conhecido.
 */
function snapValue(row: any, category?: GoalCategory): number | null {
  const raw = category?.metric_type === "count" ? row.deals_count : row.realized_amount;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}


export function useCategoryWeeklyData(
  refDate: Date,
  refreshKey = 0,
  origin: OriginFilter = "all",
  /** Soma a conta yampa 2.0 em MRR/Ativos e a variação do 2.0 no Net MRR. */
  includeYampa20 = false,
  /** Recorte por cupom de campanha da Stripe. */
  coupon: CouponFilter = "all",
): CategoryWeeklyData {
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [targets, setTargets] = useState<Map<string, number>>(new Map());
  const [series, setSeries] = useState<Map<string, CategorySnapPoint[]>>(new Map());
  const [noOriginSplit, setNoOriginSplit] = useState<Set<string>>(new Set());
  const [couponShares, setCouponShares] = useState<CouponShares | null>(null);
  const [actualSnapshotDate, setActualSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { growthPct: scenarioPct } = useGoalScenario();
  const scenarioBaseline = useScenarioBaseline();
  const { baselines: growthBaselines } = useGrowthBaselines();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { startKey, endKey, prevEndKey } = monthBounds(refDate);
      const todayKey = toBRDateKey(new Date());
      const asOfKey = endKey < todayKey ? endKey : todayKey;

      const originFiltered = isOriginFiltered(origin);
      const couponFiltered = isCouponFiltered(coupon);
      const [catRes, goalsRes, snapRes, originRes, convRes, churnRes, campaignIds, actualRes] = await Promise.all([
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
        couponFiltered
          ? supabase
              .from("stripe_conversions")
              .select("converted_at, coupon_id, mrr, mrr_net, conversion_type, is_reactivation, customer_email")
              .gte("converted_at", `${startKey}T00:00:00`)
              .lte("converted_at", `${endKey}T23:59:59`)
          : Promise.resolve({ data: [] as any[] }),
        couponFiltered
          ? supabase
              .from("metas_churn_historico")
              .select("email_norm, data_cancelamento, mrr")
              .gte("data_cancelamento", startKey)
              .lte("data_cancelamento", endKey)
          : Promise.resolve({ data: [] as any[] }),
        couponFiltered ? fetchCampaignCouponIds() : Promise.resolve(new Set<string>()),
        supabase.rpc("tactical_weekly_mrr_actual", {
          p_from: startKey,
          p_to: endKey,
          p_as_of: asOfKey,
        }),
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
        scenarioBaseline,
        growthBaselines,
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

      // Recorte por cupom: o snapshot também não tem cupom, então usamos a
      // participação das conversões da Stripe com cupom de campanha (e, para
      // churn, o cruzamento por e-mail com quem comprou usando esses cupons).
      let couponShares: CouponShares | null = null;
      if (couponFiltered) {
        const conversions = (((convRes as any).data as any[]) || []) as any[];
        const churnRows = (((churnRes as any).data as any[]) || []) as any[];
        let extraEmails = new Set<string>();
        const ids = Array.from(campaignIds as Set<string>);
        if (ids.length) {
          // O cancelado pode ter comprado com cupom em qualquer mês anterior.
          const { data: emailRows } = await supabase
            .from("stripe_conversions")
            .select("customer_email")
            .in("coupon_id", ids);
          if (cancelled) return;
          extraEmails = new Set(
            (((emailRows as any[]) || []) as any[])
              .map((r) => normalizeEmail(r.customer_email))
              .filter(Boolean),
          );
        }
        couponShares = ids.length
          ? buildCouponShares(conversions as any, churnRows as any, campaignIds as Set<string>, extraEmails)
          : EMPTY_COUPON_SHARES;
      }

      const unsupported = new Set<string>();

      const s = new Map<string, CategorySnapPoint[]>();
      for (const row of (snapRes.data as any[]) || []) {
        if (!row.category_id) continue;
        const cat = byId.get(row.category_id);
        const rawValue = snapValue(row, cat);
        if (rawValue === null) continue; // dia sem dado: mantém o último valor conhecido
        let value = rawValue;
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

      // Substitui os fluxos de MRR por um único fechamento cliente a cliente.
      // Cada linha já vem deduplicada, classificada pela data real de ativação e
      // marcada como campanha apenas quando há evidência correspondente na Stripe.
      const actualRows = ((actualRes.data as any[]) || []) as Array<{
        activation_date: string;
        classification: string;
        origin: string;
        is_campaign: boolean;
        customers: number;
        mrr: number;
        snapshot_date: string;
      }>;
      setActualSnapshotDate(actualRows[0]?.snapshot_date ?? null);
      for (const cat of cats) {
        const classification = REAL_MRR_CLASS_BY_SLUG[cat.slug];
        if (!classification) continue;
        const byDate = new Map<string, number>();
        for (const row of actualRows) {
          if (row.classification !== classification) continue;
          if (originFiltered && !matchesOrigin(row.origin, origin)) continue;
          if (coupon === "campaign" && !row.is_campaign) continue;
          if (coupon === "non_campaign" && row.is_campaign) continue;
          const value = cat.metric_type === "count" ? Number(row.customers || 0) : Number(row.mrr || 0);
          byDate.set(row.activation_date, (byDate.get(row.activation_date) ?? 0) + value);
        }
        let accumulated = 0;
        const actualPoints: CategorySnapPoint[] = [{ date: prevEndKey, value: 0 }];
        for (const date of Array.from(byDate.keys()).sort()) {
          accumulated += byDate.get(date) ?? 0;
          actualPoints.push({ date, value: accumulated });
        }
        s.set(cat.id, actualPoints);
        unsupported.delete(cat.id);
      }
      if (couponShares) {
        for (const c of cats) {
          if (!CATEGORY_SLUG_TO_COUPON_CLASS[c.slug] && !(c.component_category_ids ?? []).length) {
            unsupported.add(c.id);
          }
        }
      }

      // O recorte por cupom é aplicado sobre o FLUXO de cada dia (delta da série
      // MTD) e depois re-acumulado. Aplicar a participação acumulada do mês
      // diluiria uma campanha concentrada em poucos dias no denominador de todo
      // o mês (era o que fazia o realizado de campanha ficar abaixo do real).
      if (couponShares) {
        for (const [catId, list] of Array.from(s.entries())) {
          const cat = byId.get(catId);
          if (cat && REAL_MRR_FLOW_SLUGS.has(cat.slug)) continue;
          const cls = cat ? CATEGORY_SLUG_TO_COUPON_CLASS[cat.slug] : undefined;
          if (!cat || !cls) {
            unsupported.add(catId);
            s.delete(catId);
            continue;
          }
          const kind = cat.metric_type === "count" ? "qtd" : "mrr";
          const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
          let prevRaw: number | null = null;
           let accSelected = 0;
          let anySplit = false;
          const out: CategorySnapPoint[] = [];
          for (const p of sorted) {
            if (prevRaw === null) {
              // 1º ponto = fechamento do mês anterior (base do MTD).
              prevRaw = p.value;
              out.push({ date: p.date, value: 0 });
              continue;
            }
            const delta = Math.max(0, p.value - prevRaw);
            prevRaw = p.value;
            // O filtro "Não-campanha" precisa ser o complemento da visão
            // canônica já recortada por origem. Assim, em Visão Geral, 4blue e
            // qualquer valor sem cupom ficam em Não-campanha; no filtro Yampa ou
            // 4blue, o complemento é calculado só dentro daquela origem.
            const directCampaign =
              origin === "4blue"
                ? 0
                : couponCampaignValueBetween(couponShares, p.date, p.date, cls, kind) ?? 0;
             // A divisão acontece no próprio dia. Transportar sobra de cupom para
             // dias seguintes reclassificava valores já lançados em Não-campanha
             // e quebrava a igualdade entre os três filtros na quebra semanal.
             const split = splitCanonicalCouponValue(delta, directCampaign);
             accSelected += coupon === "campaign" ? split.campaign : split.nonCampaign;
            anySplit = true;
            out.push({
              date: p.date,
               value: accSelected,
            });
          }
          if (!anySplit) {
            unsupported.add(catId);
            s.delete(catId);
            continue;
          }
          s.set(catId, out);
        }
      }


      /**
       * "Incluir 2.0": soma a conta yampa 2.0 na leitura (nada muda no banco).
       * - MRR e Ativos Pagantes são ESTOQUE → soma no mesmo dia.
       * - Net MRR é FLUXO → entra a VARIAÇÃO do estoque de MRR do 2.0 em relação
       *   ao fechamento do mês anterior, exatamente como no Acompanhamento.
       * Sem recorte por origem (a base do 2.0 não tem origem por price ID).
       */
      if (includeYampa20 && !shares && !couponShares) {
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
        // Net MRR com 2.0 = estoque COMBINADO atual menos o fechamento anterior
        // do yampaFin. O 2.0 é uma base em migração e sua queda isolada não pode
        // reduzir o Net MRR consolidado.
        const baseMrrPoints = new Map<string, number>();
        for (const row of (snapRes.data as any[]) || []) {
          if (row.category_id === BASE_MRR_CAT) {
            baseMrrPoints.set(row.data as string, Number(row.realized_amount ?? 0));
          }
        }
        const combined = new Map<string, number>();
        for (const p of s.get(BASE_MRR_CAT) ?? []) combined.set(p.date, p.value);
        const baseBaseline = baseMrrPoints.get(prevEndKey) ?? null;
        const netList = s.get(NET_MRR_CAT);
        if (netList && baseBaseline !== null) {
          s.set(
            NET_MRR_CAT,
            netList.map((p) => {
              const level = combined.get(p.date);
              const currentBase = baseMrrPoints.get(p.date);
              if (level === undefined || currentBase === undefined) return p;
              return {
                ...p,
                value: netMrrIncludingYampa20(currentBase, level - currentBase, baseBaseline),
              };
            }),
          );
        }

      }

      setCategories(cats);
      setTargets(t);
      setSeries(s);
      setNoOriginSplit(unsupported);
      setCouponShares(couponShares);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refDate.getFullYear(), refDate.getMonth(), refreshKey, origin, includeYampa20, coupon, scenarioPct, scenarioBaseline?.month, scenarioBaseline?.value, growthBaselines]);

  return { categories, targets, series, noOriginSplit, couponShares, actualSnapshotDate, loading };
}
