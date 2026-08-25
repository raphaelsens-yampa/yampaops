/**
 * Recorte por CUPOM de campanha (Stripe).
 *
 * As campanhas são organizadas em cima de cupons da Stripe. O realizado
 * semanal, porém, vem do snapshot do Metabase (`metas_snapshot_diario`), que
 * não carrega cupom. Por isso o cupom é aplicado como PARTICIPAÇÃO (share),
 * exatamente como o recorte por origem (4blue / Yampa):
 *
 *   share = MRR (ou qtd) das conversões Stripe do mês até a data com cupom de
 *           campanha ÷ total das conversões Stripe do mesmo período/classificação
 *
 * Para Churn / MRR Decrease não existe cupom no cancelamento: o vínculo é feito
 * por E-MAIL — cancelados cujo e-mail aparece em alguma conversão Stripe com
 * cupom de campanha contam como churn de campanha.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CouponFilter = "all" | "campaign" | "non_campaign";

export const COUPON_OPTIONS: { value: CouponFilter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "campaign", label: "Campanha" },
  { value: "non_campaign", label: "Não-campanha" },
];

export const COUPON_NO_SPLIT_HINT = "Sem recorte por cupom nesta categoria";

export function couponLabel(coupon: CouponFilter) {
  return COUPON_OPTIONS.find((o) => o.value === coupon)?.label ?? "Tudo";
}

export function isCouponFiltered(coupon: CouponFilter): coupon is "campaign" | "non_campaign" {
  return coupon === "campaign" || coupon === "non_campaign";
}

/** Classificações com recorte por cupom. */
export type CouponClassification =
  | "novos_pagantes"
  | "upsell"
  | "downsell"
  | "recuperados"
  | "churn";

/** Categoria (slug em goal_categories) -> classificação com recorte por cupom. */
export const CATEGORY_SLUG_TO_COUPON_CLASS: Record<string, CouponClassification> = {
  new_mrr: "novos_pagantes",
  novos_pagantes: "novos_pagantes",
  vendas_do_dia: "novos_pagantes",
  upsell: "upsell",
  downsell: "downsell",
  recuperados: "recuperados",
  recuperacao_ft: "recuperados",
  "churn-mrr": "churn",
  "churn-logos": "churn",
  "churn-rate-logos": "churn",
};

export const COUPON_SHARE_ANY = "__any__";

export interface CampaignCoupon {
  coupon_id: string;
  coupon_name: string | null;
  is_campaign: boolean;
}

export interface CouponConversionRow {
  converted_at: string | null;
  coupon_id: string | null;
  mrr: number | null;
  mrr_net: number | null;
  conversion_type: string | null;
  is_reactivation: boolean | null;
  customer_email: string | null;
}

export interface CouponChurnRow {
  email_norm: string | null;
  data_cancelamento: string | null;
  mrr: number | null;
}

export interface CouponDayAcc {
  /** qtd de campanha */
  cq: number;
  /** MRR de campanha */
  cm: number;
  /** qtd total */
  tq: number;
  /** MRR total */
  tm: number;
}

export interface CouponShares {
  /** `${date}|${cls}` -> valores brutos do dia (não acumulados) */
  raw: Map<string, CouponDayAcc>;
  /** `${date}|${cls}` -> participação de campanha (0..1) em quantidade */
  qtd: Map<string, number>;
  /** `${date}|${cls}` -> participação de campanha (0..1) em MRR */
  mrr: Map<string, number>;
  /** datas (asc) com dado disponível */
  dates: string[];
}

export const EMPTY_COUPON_SHARES: CouponShares = {
  raw: new Map(),
  qtd: new Map(),
  mrr: new Map(),
  dates: [],
};

function dateKeyOf(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Classificação de uma conversão da Stripe. */
export function conversionClassification(row: CouponConversionRow): CouponClassification {
  const t = String(row.conversion_type ?? "").toLowerCase();
  if (row.is_reactivation || t.includes("reactiv") || t.includes("recuper")) return "recuperados";
  if (t.includes("upsell") || t.includes("upgrade") || t.includes("expans")) return "upsell";
  if (t.includes("downsell") || t.includes("downgrade")) return "downsell";
  return "novos_pagantes";
}

/** E-mails que já compraram com algum cupom de campanha. */
export function campaignEmailSet(
  rows: CouponConversionRow[],
  campaignCoupons: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.coupon_id || !campaignCoupons.has(r.coupon_id)) continue;
    const email = normalizeEmail(r.customer_email);
    if (email) out.add(email);
  }
  return out;
}

/**
 * Participação acumulada no mês (MTD) da fatia de campanha por data/classificação.
 * As séries de realizado são MTD, então o share também precisa ser MTD.
 */
export function buildCouponShares(
  conversions: CouponConversionRow[],
  churn: CouponChurnRow[],
  campaignCoupons: Set<string>,
  /** E-mails de campanha vindos de compras fora do período consultado. */
  extraCampaignEmails: Set<string> = new Set(),
): CouponShares {
  const daily = new Map<string, CouponDayAcc>();
  const dates = new Set<string>();

  const add = (date: string, cls: string, isCampaign: boolean, qtd: number, mrr: number) => {
    for (const key of [`${date}|${cls}`, `${date}|${COUPON_SHARE_ANY}`]) {
      const cur = daily.get(key) ?? { cq: 0, cm: 0, tq: 0, tm: 0 };
      cur.tq += qtd;
      cur.tm += mrr;
      if (isCampaign) {
        cur.cq += qtd;
        cur.cm += mrr;
      }
      daily.set(key, cur);
    }
    dates.add(date);
  };

  for (const r of conversions) {
    const date = dateKeyOf(r.converted_at);
    if (!date) continue;
    const cls = conversionClassification(r);
    const mrr = Math.abs(Number(r.mrr_net ?? r.mrr ?? 0));
    const isCampaign = !!r.coupon_id && campaignCoupons.has(r.coupon_id);
    add(date, cls, isCampaign, 1, mrr);
  }

  const emails = campaignEmailSet(conversions, campaignCoupons);
  for (const e of extraCampaignEmails) if (e) emails.add(e);
  for (const r of churn) {
    const date = dateKeyOf(r.data_cancelamento);
    if (!date) continue;
    add(date, "churn", emails.has(normalizeEmail(r.email_norm)), 1, Math.abs(Number(r.mrr ?? 0)));
  }

  // Acumula MTD (as datas vêm todas do mesmo mês de referência).
  const sortedDates = Array.from(dates).sort();
  const classes = new Set<string>();
  for (const k of daily.keys()) classes.add(k.split("|")[1]);

  const qtd = new Map<string, number>();
  const mrr = new Map<string, number>();
  for (const cls of classes) {
    let cq = 0;
    let cm = 0;
    let tq = 0;
    let tm = 0;
    for (const d of sortedDates) {
      const v = daily.get(`${d}|${cls}`);
      if (v) {
        cq += v.cq;
        cm += v.cm;
        tq += v.tq;
        tm += v.tm;
      }
      if (tq > 0) qtd.set(`${d}|${cls}`, Math.min(cq / tq, 1));
      if (tm > 0) mrr.set(`${d}|${cls}`, Math.min(cm / tm, 1));
    }
  }

  return { raw: daily, qtd, mrr, dates: sortedDates };
}

/**
 * Participação da campanha em uma JANELA de datas (ex.: uma semana ou um dia).
 *
 * Necessário porque o realizado semanal é um FLUXO: usar a participação
 * acumulada do mês diluiria uma campanha concentrada em poucos dias no
 * denominador de todo o mês. Sem movimento na janela, cai para a participação
 * do mês inteiro.
 */
export function couponShareBetween(
  shares: CouponShares,
  startKey: string,
  endKey: string,
  cls: CouponClassification | typeof COUPON_SHARE_ANY,
  kind: "qtd" | "mrr",
): number | null {
  if (!shares.dates.length) return null;
  let c = 0;
  let t = 0;
  let mc = 0;
  let mt = 0;
  for (const d of shares.dates) {
    const v = shares.raw.get(`${d}|${cls}`);
    if (!v) continue;
    mc += kind === "qtd" ? v.cq : v.cm;
    mt += kind === "qtd" ? v.tq : v.tm;
    if (d < startKey || d > endKey) continue;
    c += kind === "qtd" ? v.cq : v.cm;
    t += kind === "qtd" ? v.tq : v.tm;
  }
  if (t > 0) return Math.min(c / t, 1);
  if (mt > 0) return Math.min(mc / mt, 1);
  return null;
}

/** Participação as-of a data (último dado <= data; antes disso usa o 1º disponível). */
export function couponShareAsOf(
  shares: CouponShares,
  date: string,
  cls: CouponClassification | typeof COUPON_SHARE_ANY,
  kind: "qtd" | "mrr",
): number | null {
  if (!shares.dates.length) return null;
  const map = kind === "qtd" ? shares.qtd : shares.mrr;
  let chosen: string | null = null;
  for (const d of shares.dates) {
    if (d > date) break;
    if (map.has(`${d}|${cls}`)) chosen = d;
  }
  if (!chosen) {
    for (const d of shares.dates) {
      if (map.has(`${d}|${cls}`)) {
        chosen = d;
        break;
      }
    }
  }
  if (!chosen) return null;
  return map.get(`${chosen}|${cls}`) ?? null;
}

/** Aplica o modo do filtro sobre a participação de campanha. */
export function applyCouponMode(value: number, share: number, coupon: CouponFilter): number {
  if (coupon === "campaign") return value * share;
  if (coupon === "non_campaign") return value * (1 - share);
  return value;
}

/** Cadastro de cupons marcados como campanha. */
export function useCampaignCoupons() {
  const [coupons, setCoupons] = useState<CampaignCoupon[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tactical_campaign_coupons")
      .select("coupon_id, coupon_name, is_campaign")
      .order("coupon_name", { ascending: true });
    setCoupons(((data as CampaignCoupon[]) || []) as CampaignCoupon[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { coupons, loading, reload };
}

/** Ids de cupons marcados como campanha. */
export async function fetchCampaignCouponIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from("tactical_campaign_coupons")
    .select("coupon_id")
    .eq("is_campaign", true);
  return new Set((((data as any[]) || []) as any[]).map((r) => String(r.coupon_id)));
}
