/**
 * Realizado do mês ABERTO para New MRR (vendas novas, recuperados e upsell),
 * lido dos pagamentos confirmados da Stripe — a mesma base das Metas Táticas.
 * O agregado mensal do Metabase só enxerga o mês aberto quando há foto diária
 * contínua; com lacunas ele subestima as vendas.
 */
export interface StripePaidRow {
  conversion_type: string | null;
  is_reactivation: boolean | null;
  mrr: number | null;
  mrr_net: number | null;
  delta_mrr: number | null;
}

export interface OpenMonthSales {
  new_mrr: number;
  recuperados: number;
  upsell: number;
}

export function openMonthSalesFromStripe(rows: StripePaidRow[]): OpenMonthSales {
  const out: OpenMonthSales = { new_mrr: 0, recuperados: 0, upsell: 0 };
  for (const row of rows) {
    const type = String(row.conversion_type || "").toLowerCase();
    if (type === "upsell") {
      out.upsell += Math.max(Number(row.delta_mrr || 0), 0);
    } else if (row.is_reactivation) {
      out.recuperados += Math.max(Number(row.mrr_net ?? row.mrr ?? 0), 0);
    } else if (type === "new" || !type) {
      out.new_mrr += Math.max(Number(row.mrr_net ?? row.mrr ?? 0), 0);
    }
  }
  return out;
}

/** Slugs de categoria substituídos no mês aberto. */
export const OPEN_MONTH_STRIPE_SLUGS = ["new_mrr", "recuperados", "upsell"] as const;
