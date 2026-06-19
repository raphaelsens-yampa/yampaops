// Recupera conversões perdidas: pagina assinaturas do Stripe num intervalo,
// cruza com o Mapa de Preços e grava direto em stripe_conversions.
// Usado para reconciliar períodos em que o webhook estava com regra antiga.
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

  let days = 30;
  try {
    const body = await req.json();
    if (body?.days) days = Math.max(1, Math.min(365, Number(body.days)));
  } catch {}

  const sinceUnix = Math.floor((Date.now() - days * 86400 * 1000) / 1000);

  let scanned = 0;
  let inserted = 0;
  let skipped = 0;
  let unmapped = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    let startingAfter: string | undefined = undefined;
    let pages = 0;
    while (true) {
      const subs: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
        created: { gte: sinceUnix },
        limit: 100,
        status: "all",
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const sub of subs.data) {
        scanned++;
        try {
          // Pula se já existe conversão
          const { data: existing } = await supabase
            .from("stripe_conversions")
            .select("id, converted_at, registered_at")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          if (existing && existing.converted_at) { skipped++; continue; }

          const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any)?.id || null;
          const priceId = sub.items?.data?.[0]?.price?.id || null;

          // Resolve área via Mapa de Preços
          let area = "desconhecida";
          let productName: string | null = null;
          let planName: string | null = null;
          let mrr = 0;
          if (priceId) {
            const { data: pm } = await supabase
              .from("commission_price_map")
              .select("area, offer_name, plan_name, price_name, mrr_override")
              .eq("price_id", priceId)
              .maybeSingle();
            if (pm) {
              area = pm.area || "desconhecida";
              productName = pm.offer_name || null;
              planName = pm.plan_name || pm.price_name || null;
              mrr = pm.mrr_override != null ? Number(pm.mrr_override) : 0;
            } else {
              unmapped++;
            }
          }

          // Datas via Stripe: registered_at = customer.created, converted_at = primeira invoice paga
          let registeredAt: string | null = null;
          let convertedAt: string | null = null;
          let email: string | null = null;

          if (customerId) {
            const cust = await stripe.customers.retrieve(customerId);
            if (cust && !(cust as any).deleted) {
              const c = cust as Stripe.Customer;
              if (c.created) registeredAt = new Date(c.created * 1000).toISOString();
              email = c.email ?? null;
            }
            const paid = await stripe.invoices.list({ customer: customerId, status: "paid", limit: 100 });
            if (paid.data.length > 0) {
              const earliest = paid.data.reduce((min, inv) => {
                const t = inv.status_transitions?.paid_at ?? inv.created;
                const mt = min.status_transitions?.paid_at ?? min.created;
                return t < mt ? inv : min;
              });
              const ts = earliest.status_transitions?.paid_at ?? earliest.created;
              convertedAt = new Date(ts * 1000).toISOString();
            }
          }

          if (existing) {
            await supabase.from("stripe_conversions").update({
              stripe_customer_id: customerId,
              stripe_price_id: priceId,
              customer_email: email?.toLowerCase() ?? null,
              area, product_name: productName, plan_name: planName, mrr,
              registered_at: existing.registered_at ?? registeredAt,
              converted_at: convertedAt,
            }).eq("id", existing.id);
            inserted++;
          } else {
            await supabase.from("stripe_conversions").insert({
              stripe_event_id: `recover_${sub.id}_${Date.now()}`,
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              stripe_price_id: priceId,
              customer_email: email?.toLowerCase() ?? null,
              area, product_name: productName, plan_name: planName, mrr,
              registered_at: registeredAt,
              converted_at: convertedAt,
            });
            inserted++;
          }
        } catch (e: any) {
          failed++;
          if (errors.length < 20) errors.push(`${sub.id}: ${e.message}`);
        }
      }
      pages++;
      if (!subs.has_more || pages >= 50) break;
      startingAfter = subs.data[subs.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, scanned, inserted, skipped, failed }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, days, scanned, inserted, skipped, unmapped, failed, errors }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
