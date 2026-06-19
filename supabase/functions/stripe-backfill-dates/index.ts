// Recalcula registered_at (customer.created) e converted_at (1º invoice paga)
// para todas as conversões já registradas em stripe_conversions usando dados do Stripe.
// Usado quando a regra de datas mudou (antes vinha do ActiveCampaign).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let limit = 500;
  try {
    const body = await req.json();
    if (body?.limit) limit = Math.max(1, Math.min(2000, Number(body.limit)));
  } catch {}

  const { data: rows, error } = await supabase
    .from("stripe_conversions")
    .select("id, stripe_customer_id")
    .not("stripe_customer_id", "is", null)
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Cache por customer para evitar refetch
  const cache = new Map<string, { registered_at: string | null; converted_at: string | null }>();
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    const cid = row.stripe_customer_id as string;
    try {
      let dates = cache.get(cid);
      if (!dates) {
        let registered_at: string | null = null;
        let converted_at: string | null = null;
        const cust = await stripe.customers.retrieve(cid);
        if (cust && !(cust as any).deleted && (cust as Stripe.Customer).created) {
          registered_at = new Date((cust as Stripe.Customer).created * 1000).toISOString();
        }
        const paid = await stripe.invoices.list({ customer: cid, status: "paid", limit: 100 });
        if (paid.data.length > 0) {
          const earliest = paid.data.reduce((min, inv) => {
            const t = inv.status_transitions?.paid_at ?? inv.created;
            const mt = min.status_transitions?.paid_at ?? min.created;
            return t < mt ? inv : min;
          });
          const ts = earliest.status_transitions?.paid_at ?? earliest.created;
          converted_at = new Date(ts * 1000).toISOString();
        }
        dates = { registered_at, converted_at };
        cache.set(cid, dates);
      }
      await supabase
        .from("stripe_conversions")
        .update({ registered_at: dates.registered_at, converted_at: dates.converted_at })
        .eq("id", row.id);
      updated++;
    } catch (e: any) {
      failed++;
      if (errors.length < 20) errors.push(`${cid}: ${e.message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: rows?.length || 0, updated, failed, errors }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
