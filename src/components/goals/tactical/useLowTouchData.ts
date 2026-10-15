import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDateBR } from "@/lib/dateBR";
import { toBRDateKey } from "./types";

export interface LowTouchSale {
  id: string;
  email: string | null;
  plan: string | null;
  area: string;
  converted_at: string;
  dateKey: string;
  price: number;
  mrr: number;
}

export interface LowTouchArea {
  id: string;
  label: string;
  is_active: boolean;
}

interface RawConversion {
  id: string;
  customer_email: string | null;
  plan_name: string | null;
  product_name: string | null;
  converted_at: string;
  mrr: number | null;
  mrr_net: number | null;
  net_amount: number | null;
  gross_amount: number | null;
  stripe_price_id: string | null;
  conversion_type: string | null;
  delta_mrr: number | null;
}

export interface PartitionedLowTouch {
  /** Vendas Low-touch: apenas conversões "new" (renovações não são vendas). */
  sales: LowTouchSale[];
  /** Upsells Low-touch: conversões "upsell" contabilizadas como Upsell (delta de MRR). */
  upsells: LowTouchSale[];
}

export function partitionLowTouch(
  rows: RawConversion[],
  labelByPrice: Map<string, string>,
  activeLabels: Set<string>,
): PartitionedLowTouch {
  const mapped = rows
    .map((c) => {
      const area = labelByPrice.get(String(c.stripe_price_id ?? "")) ?? "";
      const d = parseDateBR(c.converted_at);
      return {
        id: c.id,
        email: c.customer_email,
        plan: c.plan_name || c.product_name,
        area,
        converted_at: c.converted_at,
        dateKey: toBRDateKey(d),
        price: Number(c.net_amount ?? c.gross_amount ?? 0),
        mrr: Number(c.mrr_net ?? c.mrr ?? 0),
        deltaMrr: Number(c.delta_mrr ?? 0),
        conversionType: String(c.conversion_type || "").toLowerCase(),
      };
    })
    .filter((r) => r.area && activeLabels.has(r.area));

  const sales: LowTouchSale[] = mapped
    .filter((r) => r.conversionType === "new" && r.mrr > 0)
    .map((r) => ({
      id: r.id,
      email: r.email,
      plan: r.plan,
      area: r.area,
      converted_at: r.converted_at,
      dateKey: r.dateKey,
      price: r.price,
      mrr: r.mrr,
    }));

  const upsells: LowTouchSale[] = mapped
    .filter((r) => r.conversionType === "upsell" && r.deltaMrr > 0)
    .map((r) => ({
      id: r.id,
      email: r.email,
      plan: r.plan,
      area: r.area,
      converted_at: r.converted_at,
      dateKey: r.dateKey,
      price: r.price,
      mrr: r.deltaMrr,
    }));

  return { sales, upsells };
}

/**
 * Carrega as conversões classificadas como Low-touch: vendas cujo rótulo de
 * Vendedor/Área no Mapa de Preços está marcado como área Low-touch.
 */
export function useLowTouchData(rangeStart: Date, rangeEnd: Date, refreshKey = 0) {
  const [sales, setSales] = useState<LowTouchSale[]>([]);
  const [upsells, setUpsells] = useState<LowTouchSale[]>([]);
  const [areas, setAreas] = useState<LowTouchArea[]>([]);
  const [allLabels, setAllLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const from = new Date(rangeStart); from.setHours(0, 0, 0, 0);
      const to = new Date(rangeEnd); to.setHours(23, 59, 59, 999);

      const [areasRes, mapRes, convRes] = await Promise.all([
        supabase.from("tactical_lowtouch_areas").select("id, label, is_active").order("label"),
        supabase.from("commission_price_map").select("price_id, seller_label"),
        supabase
          .from("stripe_conversions")
          .select("id, customer_email, plan_name, product_name, converted_at, mrr, mrr_net, net_amount, gross_amount, stripe_price_id, conversion_type, delta_mrr")
          .gte("converted_at", from.toISOString())
          .lte("converted_at", to.toISOString())
          .order("converted_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const areaRows = ((areasRes.data as LowTouchArea[]) || []);
      const activeLabels = new Set(areaRows.filter((a) => a.is_active).map((a) => a.label));

      const labelByPrice = new Map<string, string>();
      const labels = new Set<string>();
      for (const m of mapRes.data || []) {
        const label = String((m as any).seller_label || "").trim();
        if (!label) continue;
        labelByPrice.set(String((m as any).price_id), label);
        labels.add(label);
      }
      for (const a of areaRows) labels.add(a.label);

      const part = partitionLowTouch(
        (convRes.data as unknown as RawConversion[]) || [],
        labelByPrice,
        activeLabels,
      );

      setAreas(areaRows);
      setAllLabels(Array.from(labels).sort((a, b) => a.localeCompare(b, "pt-BR")));
      setSales(part.sales);
      setUpsells(part.upsells);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [rangeStart.getTime(), rangeEnd.getTime(), refreshKey]);

  return { sales, upsells, areas, allLabels, loading };
}
