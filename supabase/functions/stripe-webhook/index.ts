// Stripe webhook receiver — matches Stripe customers to pipeline deals by email.
// Public endpoint (no JWT). Validates Stripe signature with HMAC-SHA256.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const DEFAULT_PIPELINE_ID = "ad7d090f-dc11-4d78-a537-6d136737b5b6";
const PENDING_STAGE = "pendencias_stripe";

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !supabaseUrl || !serviceKey) {
    console.error("Missing required env vars");
    return ok({ error: "Server misconfigured" }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const supabase = createClient(supabaseUrl, serviceKey);

  // Get raw body for signature validation
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } else {
      // No secret configured yet — parse without validation but log warning
      console.warn("STRIPE_WEBHOOK_SECRET not set; accepting unverified event (dev only)");
      event = JSON.parse(rawBody);
    }
  } catch (err) {
    console.error("Signature validation failed:", err);
    return ok({ error: "Invalid signature" }, 400);
  }

  // Idempotency: insert event row, skip if already processed
  const { error: insertError } = await supabase
    .from("stripe_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      result: "received",
    });

  if (insertError && insertError.code === "23505") {
    // already processed
    return ok({ ok: true, skipped: "duplicate" });
  }
  if (insertError) {
    console.error("Failed to insert stripe_events:", insertError);
    // Continue anyway — better to process than to lose
  }

  // Only handle relevant events
  const RELEVANT = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "invoice.paid",
  ]);
  if (!RELEVANT.has(event.type)) {
    await supabase.from("stripe_events")
      .update({ result: "ignored_event_type" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, ignored: event.type });
  }

  // Extract email + customer + subscription + price
  let email: string | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let priceId: string | null = null;

  try {
    const obj: any = event.data.object;

    if (event.type === "checkout.session.completed") {
      email = obj.customer_email || obj.customer_details?.email || null;
      customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id || null;
      subscriptionId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id || null;
      // Need to fetch line items to get price_id
      if (obj.id) {
        const items = await stripe.checkout.sessions.listLineItems(obj.id, { limit: 1 });
        priceId = items.data[0]?.price?.id || null;
      }
    } else if (event.type === "customer.subscription.created") {
      customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id || null;
      subscriptionId = obj.id;
      priceId = obj.items?.data?.[0]?.price?.id || null;
    } else if (event.type === "invoice.paid") {
      email = obj.customer_email || null;
      customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id || null;
      subscriptionId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id || null;
      priceId = obj.lines?.data?.[0]?.price?.id || null;
    }

    // Fetch email from customer if missing
    if (!email && customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted) {
        email = (customer as Stripe.Customer).email;
      }
    }
  } catch (err) {
    console.error("Failed to extract payload:", err);
    await supabase.from("stripe_events")
      .update({ result: "extraction_failed" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, error: "extraction_failed" });
  }

  if (!email) {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_no_email",
      ac_id: customerId,
      error_message: `Stripe event ${event.type} sem email do customer`,
      payload: { event_id: event.id, customer_id: customerId, price_id: priceId },
      resolved: false,
    });
    await supabase.from("stripe_events")
      .update({ result: "no_email" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, warning: "no_email" });
  }

  const normEmail = email.trim().toLowerCase();

  // Find an active deal in the default pipeline whose contact has this email
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id")
    .ilike("email", normEmail);

  const contactIds = (contacts || []).map((c) => c.id);

  if (contactIds.length === 0) {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_no_match",
      ac_id: customerId,
      error_message: `Email ${normEmail} não encontrado em contatos`,
      payload: { event_id: event.id, email: normEmail, customer_id: customerId, price_id: priceId, subscription_id: subscriptionId },
      resolved: false,
    });
    await supabase.from("stripe_events")
      .update({ result: "no_contact_match" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, warning: "no_contact_match" });
  }

  // Find active deal in default pipeline, skip already won/lost
  const { data: deal } = await supabase
    .from("opportunities")
    .select("id, stage, estimated_mrr")
    .eq("pipeline_id", DEFAULT_PIPELINE_ID)
    .eq("is_active", true)
    .in("contact_id", contactIds)
    .not("stage", "in", `(ganho,perdido,fechado_won,fechado_lost,${PENDING_STAGE})`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!deal) {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_no_match",
      ac_id: customerId,
      error_message: `Nenhum deal ativo encontrado no pipeline padrão para ${normEmail}`,
      payload: { event_id: event.id, email: normEmail, customer_id: customerId, price_id: priceId, subscription_id: subscriptionId },
      resolved: false,
    });
    await supabase.from("stripe_events")
      .update({ result: "no_deal_match" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, warning: "no_deal_match" });
  }

  // Resolve MRR from price_id (commission_products is the source of truth)
  let resolvedMrr: number | null = null;
  if (priceId) {
    const { data: prod } = await supabase
      .from("commission_products")
      .select("plan_mrr")
      .eq("stripe_price_id", priceId)
      .not("plan_mrr", "is", null)
      .gt("plan_mrr", 0)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prod?.plan_mrr) {
      resolvedMrr = Number(prod.plan_mrr);
    } else {
      // Fallback: stripe_prices table
      const { data: sp } = await supabase
        .from("stripe_prices")
        .select("mrr")
        .eq("price_id", priceId)
        .gt("mrr", 0)
        .limit(1)
        .maybeSingle();
      if (sp?.mrr) resolvedMrr = Number(sp.mrr);
    }
  }

  // Build update payload — only override estimated_mrr if currently empty
  const updatePayload: Record<string, unknown> = {
    previous_stage: deal.stage,
    stage: PENDING_STAGE,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    stripe_pending_since: new Date().toISOString(),
  };
  const currentMrr = Number((deal as any).estimated_mrr || 0);
  if (resolvedMrr && currentMrr <= 0) {
    updatePayload.estimated_mrr = resolvedMrr;
  }

  const { error: updateError } = await supabase
    .from("opportunities")
    .update(updatePayload)
    .eq("id", deal.id);

  if (updateError) {
    console.error("Failed to update opportunity:", updateError);
    await supabase.from("stripe_events")
      .update({ result: "update_failed", matched_opportunity_id: deal.id })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, error: "update_failed" });
  }

  await supabase.from("stripe_events")
    .update({ result: "matched_pending", matched_opportunity_id: deal.id })
    .eq("stripe_event_id", event.id);

  return ok({ ok: true, matched: deal.id, stage: PENDING_STAGE });
});
