// Confere na Stripe se cada venda foi realmente paga e grava payment_status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { fetchPaymentStatus } from "../_shared/paymentStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const internal = req.headers.get("x-internal-job") === "stripe-payment-reconcile-daily";
  if (!internal) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data } = await supabase.auth.getUser(token);
    if (!data?.user) return json({ error: "unauthorized" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const days = Math.max(1, Math.min(365, Number(body?.days) || 90));
  const recheckPaid = body?.recheckPaid === true;
  const ids: string[] | null = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : null;

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let q = supabase.from("stripe_conversions")
    .select("id, stripe_subscription_id, stripe_invoice_id, payment_status, customer_email")
    .not("stripe_subscription_id", "is", null)
    .or("attribution_source.is.null,attribution_source.neq.metabase_4blue")
    .order("converted_at", { ascending: false })
    .limit(1000);
  if (ids) q = q.in("id", ids);
  else {
    q = q.gte("converted_at", since);
    if (!recheckPaid) q = q.neq("payment_status", "paid");
  }
  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const result = { checked: 0, paid: 0, pending: 0, failed: 0, errors: 0, changed: [] as any[] };
  for (const r of rows ?? []) {
    try {
      const s = await fetchPaymentStatus(stripe, r.stripe_subscription_id!, r.stripe_invoice_id);
      result.checked++;
      result[s.status]++;
      await supabase.from("stripe_conversions")
        .update({ payment_status: s.status, payment_checked_at: new Date().toISOString() })
        .eq("id", r.id);
      if (s.status !== r.payment_status) result.changed.push({ email: r.customer_email, from: r.payment_status, to: s.status, sub: s.subStatus, inv: s.invoiceStatus });
    } catch (e) {
      result.errors++;
      console.error("reconcile failed", r.id, (e as Error).message);
    }
  }
  return json(result);
});
