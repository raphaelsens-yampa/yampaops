// Stripe webhook receiver — matches Stripe customers to pipeline deals by email.
// Public endpoint (no JWT). Validates Stripe signature with HMAC-SHA256.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};


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
    "customer.subscription.updated",
    "invoice.paid",
  ]);
  if (!RELEVANT.has(event.type)) {
    await supabase.from("stripe_events")
      .update({ result: "ignored_event_type" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, ignored: event.type });
  }

  // Filtro: ignorar cobranças recorrentes — só processar criação de assinatura nova
  if (event.type === "invoice.paid") {
    const billingReason = (event.data.object as any)?.billing_reason;
    if (billingReason !== "subscription_create") {
      await supabase.from("stripe_events")
        .update({ result: `ignored_recurring:${billingReason || "unknown"}` })
        .eq("stripe_event_id", event.id);
      return ok({ ok: true, ignored: "recurring", billing_reason: billingReason });
    }
  }

  // customer.subscription.updated: só interessa se o price mudou
  if (event.type === "customer.subscription.updated") {
    const prev = (event.data as any)?.previous_attributes ?? {};
    const items = (event.data.object as any)?.items?.data ?? [];
    const prevItems = prev?.items?.data ?? null;
    const currentPriceIds = items.map((i: any) => i?.price?.id).filter(Boolean).sort().join(",");
    const prevPriceIds = prevItems ? prevItems.map((i: any) => i?.price?.id).filter(Boolean).sort().join(",") : null;
    const priceChanged = prevPriceIds !== null && prevPriceIds !== currentPriceIds;
    if (!priceChanged) {
      await supabase.from("stripe_events")
        .update({ result: "ignored_subscription_update_no_price_change" })
        .eq("stripe_event_id", event.id);
      return ok({ ok: true, ignored: "subscription_update_no_price_change" });
    }
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
    } else if (event.type === "customer.subscription.updated") {
      customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id || null;
      subscriptionId = obj.id;
      priceId = obj.items?.data?.[0]?.price?.id || null;
    } else if (event.type === "invoice.paid") {
      // Aqui só chega se billing_reason === 'subscription_create'
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

  // ─── Resolver área + MRR + nomes pelo Mapa de Preços ───
  let convArea: string = "desconhecida";
  let convProductName: string | null = null;
  let convPlanName: string | null = null;
  let convMrr = 0;
  let priceMapped = false;
  if (priceId) {
    const { data: pm } = await supabase
      .from("commission_price_map")
      .select("area, offer_name, plan_name, price_name, mrr_override")
      .eq("price_id", priceId)
      .maybeSingle();
    if (pm) {
      priceMapped = true;
      convArea = pm.area || "desconhecida";
      convProductName = pm.offer_name || null;
      convPlanName = pm.plan_name || pm.price_name || null;
      if (pm.mrr_override != null) convMrr = Number(pm.mrr_override);
    }
  }

  // ─── Fallback: calcular MRR real a partir do preço Stripe ───
  // Usado quando o price não está mapeado OU está mapeado sem mrr_override.
  // Normaliza qualquer recorrência (day/week/month/year) para mensal.
  if (priceId && convMrr <= 0) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      const amount = (price.unit_amount ?? 0) / 100;
      const interval = price.recurring?.interval;
      const count = price.recurring?.interval_count || 1;
      if (amount > 0 && interval) {
        switch (interval) {
          case "month": convMrr = amount / count; break;
          case "year": convMrr = amount / (12 * count); break;
          case "week": convMrr = (amount * 4.345) / count; break;
          case "day":  convMrr = (amount * 30) / count; break;
        }
      }
    } catch (err) {
      console.error("Failed to retrieve price for MRR fallback:", err);
    }
  }

  // ─── Descartar somente pagamento zerado ───
  // Regra: se MRR final = 0 (oferta gratuita / sem cobrança recorrente), descarta.
  // Se MRR > 0 mas price não mapeado, segue em frente — fica como pendência de mapeamento.
  if (convMrr <= 0) {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_discarded_no_value",
      ac_id: subscriptionId || customerId || event.id,
      error_message: !priceId
        ? "Conversão descartada: sem stripe_price_id"
        : "Conversão descartada: pagamento/MRR zerado",
      payload: {
        event_id: event.id,
        event_type: event.type,
        customer_id: customerId,
        subscription_id: subscriptionId,
        price_id: priceId,
        email: normEmail,
        mrr: convMrr,
        source: "webhook",
      },
      resolved: true,
    });
    await supabase.from("stripe_events")
      .update({ result: !priceId ? "discarded_no_price" : "discarded_zero_mrr" })
      .eq("stripe_event_id", event.id);
    return ok({ ok: true, discarded: true });
  }

  // ─── Datas oficiais vindas do Stripe ───
  // registered_at = data em que o customer foi criado no Stripe (entrou na base)
  // converted_at  = data do primeiro pagamento confirmado (earliest paid invoice)
  let registeredAt: string | null = null;
  let convertedAt: string | null = null;

  try {
    if (customerId) {
      const cust = await stripe.customers.retrieve(customerId);
      if (cust && !(cust as any).deleted && (cust as Stripe.Customer).created) {
        registeredAt = new Date((cust as Stripe.Customer).created * 1000).toISOString();
      }
      const paid = await stripe.invoices.list({
        customer: customerId,
        status: "paid",
        limit: 100,
      });
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
  } catch (err) {
    console.error("Failed to fetch Stripe customer/invoices for dates:", err);
  }

  // Fallback: se o evento atual já é invoice.paid, usa o paid_at dele
  if (!convertedAt && event.type === "invoice.paid") {
    const obj: any = event.data.object;
    const ts = obj?.status_transitions?.paid_at ?? obj?.created;
    if (ts) convertedAt = new Date(ts * 1000).toISOString();
  }

  // ─── Idempotência ───
  // Uma assinatura pode ter múltiplas linhas (uma por price), refletindo upsells.
  // Dedup por (subscription_id, price_id) — se existir, é renovação/duplicado do mesmo plano.
  // Fallback por event_id para casos sem subscription.
  let existingRow: { id: string; converted_at: string | null; registered_at: string | null; stripe_event_id: string | null } | null = null;
  if (subscriptionId && priceId) {
    const { data } = await supabase
      .from("stripe_conversions")
      .select("id, converted_at, registered_at, stripe_event_id")
      .eq("stripe_subscription_id", subscriptionId)
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    existingRow = data as any;
  }
  if (!existingRow) {
    const { data } = await supabase
      .from("stripe_conversions")
      .select("id, converted_at, registered_at, stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    existingRow = data as any;
  }

  // converted_at deve ser STÁVEL: sempre o 1º pagamento (mais antigo).
  const earliest = (a: string | null, b: string | null): string | null => {
    if (!a) return b;
    if (!b) return a;
    return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
  };
  const finalConvertedAt = earliest(existingRow?.converted_at ?? null, convertedAt);
  const finalRegisteredAt = existingRow?.registered_at ?? registeredAt ?? null;

  // ─── Classificação: new | upsell | downgrade | renewal ───
  let conversionType: string = "new";
  let previousMrr = 0;
  let previousPriceId: string | null = null;
  let previousConversionId: string | null = null;
  try {
    const { data: cls } = await supabase.rpc("classify_stripe_conversion", {
      p_customer_id: customerId,
      p_email: normEmail,
      p_price_id: priceId,
      p_mrr: convMrr,
      p_self_id: existingRow?.id ?? null,
    });
    const row = Array.isArray(cls) ? cls[0] : cls;
    if (row) {
      conversionType = row.conversion_type ?? "new";
      previousMrr = Number(row.previous_mrr ?? 0);
      previousPriceId = row.previous_price_id ?? null;
      previousConversionId = row.previous_conversion_id ?? null;
    }
  } catch (err) {
    console.error("classify_stripe_conversion failed:", err);
  }

  // ─── Resolução do vendedor (Chatwoot / campanhas / conversão anterior) ───
  let assignedSellerId: string | null = null;
  let attributionSource: string | null = null;
  try {
    const { data: rs } = await supabase.rpc("resolve_stripe_seller", {
      p_customer_id: customerId,
      p_email: normEmail,
      p_at: finalConvertedAt ?? new Date().toISOString(),
    });
    const row = Array.isArray(rs) ? rs[0] : rs;
    if (row) {
      assignedSellerId = row.seller_id ?? null;
      attributionSource = row.source ?? null;
    }
  } catch (err) {
    console.error("resolve_stripe_seller failed:", err);
  }

  const conversionRow: Record<string, unknown> = {
    stripe_event_id: existingRow?.stripe_event_id ?? event.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    customer_email: normEmail,
    area: convArea,
    product_name: convProductName,
    plan_name: convPlanName,
    mrr: convMrr,
    registered_at: finalRegisteredAt,
    converted_at: finalConvertedAt,
    conversion_type: conversionType,
    previous_mrr: previousMrr,
    previous_price_id: previousPriceId,
    previous_conversion_id: previousConversionId,
    assigned_seller_id: assignedSellerId,
    attribution_source: attributionSource,
  };

  const conversionExists = !!existingRow;
  if (!conversionExists) {
    // Upsert com onConflict elimina race condition entre múltiplos webhooks (checkout.completed,
    // subscription.created, invoice.paid) que chegam quase simultaneamente para a mesma assinatura+price.
    const { error: convError } = await supabase
      .from("stripe_conversions")
      .upsert(conversionRow, { onConflict: "stripe_subscription_id,stripe_price_id", ignoreDuplicates: true });

    if (convError) {
      console.error("Failed to persist conversion:", convError);
      await supabase.from("stripe_events")
        .update({ result: "conversion_failed" })
        .eq("stripe_event_id", event.id);
      return ok({ ok: true, error: "conversion_failed" });
    }
  } else {
    // Idempotente: atualiza apenas datas estáveis se mudaram; não sobrescreve atribuição manual.
    const changed =
      existingRow.converted_at !== finalConvertedAt ||
      existingRow.registered_at !== finalRegisteredAt;
    if (changed) {
      await supabase.from("stripe_conversions")
        .update({ converted_at: finalConvertedAt, registered_at: finalRegisteredAt })
        .eq("id", existingRow.id);
    }
  }

  // Sinaliza price_id não mapeado no Mapa de Preços
  if (priceId && convArea === "desconhecida") {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_unmapped_price",
      ac_id: priceId,
      error_message: `price_id ${priceId} não está no Mapa de Preços`,
      payload: { event_id: event.id, price_id: priceId, email: normEmail, subscription_id: subscriptionId },
      resolved: false,
    });
  }

  // Sinaliza upsell sem vendedor atribuído (vira pendência manual)
  if (!conversionExists && conversionType === "upsell" && !assignedSellerId) {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_upsell_no_seller",
      ac_id: subscriptionId || customerId || event.id,
      error_message: `Upsell detectado sem vendedor atribuído (${normEmail})`,
      payload: { event_id: event.id, customer_id: customerId, subscription_id: subscriptionId, price_id: priceId, previous_price_id: previousPriceId, delta_mrr: convMrr - previousMrr },
      resolved: false,
    });
  }

  await supabase.from("stripe_events")
    .update({ result: conversionExists ? `duplicate:${conversionType}` : `recorded:${conversionType}` })
    .eq("stripe_event_id", event.id);

  return ok({
    ok: true,
    recorded: !conversionExists,
    conversion_type: conversionType,
    previous_mrr: previousMrr,
    delta_mrr: convMrr - previousMrr,
    assigned_seller_id: assignedSellerId,
    attribution_source: attributionSource,
    area: convArea,
    price_mapped: convArea !== "desconhecida",
  });
});
