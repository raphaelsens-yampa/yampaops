/**
 * Cross-sell (BPO avulso) em Metas Estratégicas é ESTOQUE: o add-on segue
 * contando todo mês enquanto a assinatura BPO estiver ativa (não só no mês da venda).
 * Time Financeiro é plano completo e não entra.
 */
export interface BpoSale {
  customer_email: string | null;
  stripe_subscription_id: string | null;
  conversion_type: string | null;
  mrr: number | null;
  mrr_net: number | null;
  delta_mrr: number | null;
  date: string; // YYYY-MM-DD (São Paulo)
}
export interface BpoChurn { stripe_subscription_id: string | null; customer_email: string | null; date: string }

export const isCrossSellPlan = (plan: string | null | undefined) =>
  /bpo/i.test(plan || "") && !/time financeiro/i.test(plan || "");

/** Valor do add-on: upsell conta o acréscimo; venda nova/renovação conta o MRR. */
export function addonValue(s: BpoSale): number {
  const t = String(s.conversion_type || "").toLowerCase();
  if (t === "upsell") return Math.max(Number(s.delta_mrr || 0), 0);
  return Math.max(Number(s.mrr_net ?? s.mrr ?? 0), 0);
}

/** Contas e MRR de cross-sell ativos em uma data de corte. */
export function crossSellStockAt(sales: BpoSale[], churns: BpoChurn[], cutoff: string) {
  const latest = new Map<string, BpoSale>();
  for (const s of sales) {
    if (s.date > cutoff) continue;
    const key = String(s.customer_email || s.stripe_subscription_id || "").trim().toLowerCase();
    if (!key) continue;
    const cur = latest.get(key);
    if (!cur || s.date >= cur.date) latest.set(key, s);
  }
  let mrr = 0; let accounts = 0;
  latest.forEach((s, key) => {
    const churned = churns.some((c) => c.date <= cutoff && c.date >= s.date && (
      (c.stripe_subscription_id && c.stripe_subscription_id === s.stripe_subscription_id) ||
      String(c.customer_email || "").trim().toLowerCase() === key));
    if (churned) return;
    const v = addonValue(s);
    if (v <= 0) return;
    mrr += v; accounts += 1;
  });
  return { mrr: Math.round(mrr * 100) / 100, accounts };
}
