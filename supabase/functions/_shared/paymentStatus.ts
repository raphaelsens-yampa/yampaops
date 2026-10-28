// Decide se a venda está paga na Stripe a partir da assinatura e da 1ª fatura.
export type PaymentStatus = "paid" | "pending" | "failed";

export function classifyPayment(sub: any | null, invoice: any | null): PaymentStatus {
  const subStatus = String(sub?.status ?? "");
  const invStatus = String(invoice?.status ?? "");
  const charge = invoice?.charge && typeof invoice.charge === "object" ? invoice.charge : null;
  if (charge && (charge.refunded || charge.disputed)) return "failed";
  if (subStatus === "incomplete_expired") return "failed";
  if (invStatus === "void" || invStatus === "uncollectible") return "failed";
  if (invStatus === "paid" && Number(invoice?.amount_paid ?? 0) > 0) return "paid";
  if (invStatus === "paid" && subStatus !== "incomplete") return "paid";
  if (subStatus === "incomplete") return invoice?.attempted ? "failed" : "pending";
  if (invStatus === "open") return invoice?.attempted ? "failed" : "pending";
  if (subStatus === "canceled" && invStatus !== "paid") return "failed";
  return "pending";
}

/** Busca assinatura + fatura de criação e classifica. */
export async function fetchPaymentStatus(stripe: any, subscriptionId: string, invoiceId?: string | null) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  let invoice: any = null;
  const list = await stripe.invoices.list({ subscription: subscriptionId, limit: 100 });
  invoice = list.data.find((i: any) => i.billing_reason === "subscription_create")
    ?? (invoiceId ? list.data.find((i: any) => i.id === invoiceId) : null)
    ?? list.data[list.data.length - 1] ?? null;
  if (invoice?.id) invoice = await stripe.invoices.retrieve(invoice.id, { expand: ["charge"] });
  const ch: any = invoice?.charge && typeof invoice.charge === "object" ? invoice.charge : null;
  const why = { billing: invoice?.billing_reason, paid: invoice?.amount_paid, refunded: ch?.refunded, amount_refunded: ch?.amount_refunded, disputed: ch?.disputed, attempted: invoice?.attempted };
  return { why, status: classifyPayment(sub, invoice), subStatus: sub?.status, invoiceStatus: invoice?.status, invoiceId: invoice?.id ?? null };
}
