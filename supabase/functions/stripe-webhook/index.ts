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
  let hasMrrOverride = false;
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
      if (pm.mrr_override != null) {
        convMrr = Number(pm.mrr_override);
        hasMrrOverride = true;
      }
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

  // ─── Lookup de invoice + valores líquidos (com desconto de cupom) ───
  // Fonte de verdade para "quanto foi cobrado de fato": a invoice do Stripe.
  let grossAmount: number | null = null;
  let netAmount: number | null = null;
  let discountAmount = 0;
  let mrrNet: number | null = null;
  let couponId: string | null = null;
  let couponName: string | null = null;
  let couponPercentOff: number | null = null;
  let couponAmountOff: number | null = null;
  let promotionCode: string | null = null;
  let discountDuration: string | null = null;
  let discountDurationInMonths: number | null = null;
  let stripeInvoiceId: string | null = null;
  let netAmountSource: "invoice" | "price_fallback" = "price_fallback";

  try {
    let targetInvoiceId: string | null = null;
    const obj: any = event.data.object;

    if (event.type === "invoice.paid") {
      targetInvoiceId = obj?.id ?? null;
    } else if (event.type === "checkout.session.completed") {
      targetInvoiceId = (typeof obj?.invoice === "string" ? obj.invoice : obj?.invoice?.id) ?? null;
    }
    // Fallback / subscription events: pega última invoice paga da subscription
    if (!targetInvoiceId && subscriptionId) {
      const inv = await stripe.invoices.list({
        subscription: subscriptionId,
        status: "paid",
        limit: 1,
      });
      targetInvoiceId = inv.data[0]?.id ?? null;
    }

    if (targetInvoiceId) {
      const invoice = await stripe.invoices.retrieve(targetInvoiceId, {
        expand: ["discounts", "lines.data.discounts", "total_discount_amounts.discount"],
      });
      stripeInvoiceId = invoice.id;
      grossAmount = (invoice.subtotal ?? 0) / 100;
      netAmount = (invoice.amount_paid ?? invoice.total ?? 0) / 100;
      const totalDiscCents = (invoice.total_discount_amounts ?? [])
        .reduce((s: number, d: any) => s + Number(d?.amount || 0), 0);
      discountAmount = totalDiscCents / 100;

      // Cupom / desconto (pega o primeiro discount aplicado)
      const discounts: any[] = (invoice as any).discounts ?? [];
      const firstDisc = discounts[0];
      if (firstDisc && typeof firstDisc === "object") {
        const coupon = firstDisc.coupon;
        if (coupon) {
          couponId = coupon.id ?? null;
          couponName = coupon.name ?? null;
          couponPercentOff = coupon.percent_off ?? null;
          couponAmountOff = coupon.amount_off != null ? coupon.amount_off / 100 : null;
          discountDuration = coupon.duration ?? null;
          discountDurationInMonths = coupon.duration_in_months ?? null;
        }
        if (firstDisc.promotion_code) {
          const pc = firstDisc.promotion_code;
          promotionCode = typeof pc === "string" ? pc : (pc?.code ?? pc?.id ?? null);
        }
      }

      // MRR líquido: acha a linha da invoice do priceId, subtrai desconto rateado e normaliza pra mês
      if (priceId) {
        const line = (invoice.lines?.data ?? []).find(
          (l: any) => l?.price?.id === priceId,
        ) as any;
        if (line) {
          const lineGrossCents = Number(line.amount ?? 0);
          const lineDiscCents = (line.discount_amounts ?? [])
            .reduce((s: number, d: any) => s + Number(d?.amount || 0), 0);
          const netCents = Math.max(0, lineGrossCents - lineDiscCents);
          const netValue = netCents / 100;
          const interval = line.price?.recurring?.interval;
          const count = line.price?.recurring?.interval_count || 1;
          if (interval) {
            switch (interval) {
              case "month": mrrNet = netValue / count; break;
              case "year":  mrrNet = netValue / (12 * count); break;
              case "week":  mrrNet = (netValue * 4.345) / count; break;
              case "day":   mrrNet = (netValue * 30) / count; break;
            }
          } else if (netValue > 0) {
            mrrNet = netValue;
          }
        }
      }

      netAmountSource = "invoice";
    }
  } catch (err) {
    console.error("invoice net-amount lookup failed:", err);
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_invoice_lookup_failed",
      ac_id: subscriptionId || customerId || event.id,
      error_message: `Falha ao buscar invoice p/ valor líquido: ${(err as any)?.message || String(err)}`,
      payload: { event_id: event.id, event_type: event.type, subscription_id: subscriptionId, customer_id: customerId, price_id: priceId },
      resolved: true,
    });
  }

  // ─── MRR gravado = valor LÍQUIDO efetivamente cobrado (com cupom aplicado). ───
  // Sempre que temos mrrNet calculado a partir da invoice, ele é a fonte de
  // verdade — inclusive quando o mapa define mrr_override (o override passa a
  // ser usado apenas como fallback de comissão quando não há invoice paga).
  if (mrrNet != null && mrrNet > 0) {
    convMrr = mrrNet;
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
  // Lookups em ordem:
  //   1) (subscription_id, price_id) — mesmo plano na mesma assinatura
  //   2) (customer_id, price_id, converted_at) — duplo-checkout no Stripe gera subs
  //      diferentes para o mesmo cliente/oferta/data; tratamos como o mesmo registro
  //   3) event_id — fallback para casos sem subscription
  let existingRow: { id: string; converted_at: string | null; registered_at: string | null; stripe_event_id: string | null } | null = null;
  let dedupReason: "same_subscription" | "same_customer_price_date" | "same_event" | null = null;
  if (subscriptionId && priceId) {
    const { data } = await supabase
      .from("stripe_conversions")
      .select("id, converted_at, registered_at, stripe_event_id")
      .eq("stripe_subscription_id", subscriptionId)
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    if (data) { existingRow = data as any; dedupReason = "same_subscription"; }
  }
  if (!existingRow && customerId && priceId && convertedAt) {
    const { data } = await supabase
      .from("stripe_conversions")
      .select("id, converted_at, registered_at, stripe_event_id")
      .eq("stripe_customer_id", customerId)
      .eq("stripe_price_id", priceId)
      .eq("converted_at", convertedAt)
      .maybeSingle();
    if (data) {
      existingRow = data as any;
      dedupReason = "same_customer_price_date";
      // Sinaliza duplo-checkout no Stripe (assinaturas distintas, mesma cobrança)
      await supabase.from("integration_sync_errors").insert({
        entity_type: "stripe_duplicate_checkout",
        ac_id: subscriptionId || customerId,
        error_message: `Duplo checkout detectado: ${normEmail} criou nova subscription (${subscriptionId}) para a mesma oferta/data já registrada`,
        payload: {
          event_id: event.id,
          customer_id: customerId,
          new_subscription_id: subscriptionId,
          existing_conversion_id: (data as any).id,
          price_id: priceId,
          converted_at: convertedAt,
        },
        resolved: true,
      });
    }
  }
  if (!existingRow) {
    const { data } = await supabase
      .from("stripe_conversions")
      .select("id, converted_at, registered_at, stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (data) { existingRow = data as any; dedupReason = "same_event"; }
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

  // ─── Detecção de reativação (cliente cancelou e voltou) ───
  // Combina 2 sinais: subscription anterior com status=canceled OU gap >= N meses
  // desde a última invoice.paid anterior à conversão atual.
  // Quando reativação é detectada, força conversion_type='new' para entrar como nova venda.
  let isReactivation = false;
  let previousChurnAt: string | null = null;
  if (customerId && finalConvertedAt) {
    try {
      const { data: settingsRow } = await supabase
        .from("commission_settings")
        .select("reactivation_gap_months")
        .limit(1)
        .maybeSingle();
      const gapMonths = Number((settingsRow as any)?.reactivation_gap_months ?? 2);
      const convTs = new Date(finalConvertedAt).getTime();

      // Sinal 1: subscription cancelada anterior à conversão atual
      let canceledEndedAtMs: number | null = null;
      const canceledSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "canceled",
        limit: 10,
      });
      for (const sub of canceledSubs.data) {
        if (subscriptionId && sub.id === subscriptionId) continue;
        const ts = (sub.ended_at ?? sub.canceled_at ?? sub.created) * 1000;
        if (ts < convTs && (canceledEndedAtMs === null || ts > canceledEndedAtMs)) {
          canceledEndedAtMs = ts;
        }
      }

      // Sinal 2: última invoice paga anterior à conversão atual
      let lastPaidBeforeMs: number | null = null;
      const paidInvoices = await stripe.invoices.list({
        customer: customerId,
        status: "paid",
        limit: 100,
      });
      for (const inv of paidInvoices.data) {
        const ts = (inv.status_transitions?.paid_at ?? inv.created) * 1000;
        // < convTs por pelo menos 1 dia (evita contar a própria fatura atual)
        if (ts < convTs - 86_400_000 && (lastPaidBeforeMs === null || ts > lastPaidBeforeMs)) {
          lastPaidBeforeMs = ts;
        }
      }

      const referenceMs = Math.max(canceledEndedAtMs ?? 0, lastPaidBeforeMs ?? 0) || null;
      if (referenceMs) {
        previousChurnAt = new Date(referenceMs).toISOString();
        // Gap em meses (aproximado, 30.44 dias/mês)
        const gapMs = convTs - referenceMs;
        const gapMonthsActual = gapMs / (1000 * 60 * 60 * 24 * 30.44);
        const hasCanceledSignal = canceledEndedAtMs !== null;
        if ((hasCanceledSignal || lastPaidBeforeMs !== null) && gapMonthsActual >= gapMonths) {
          isReactivation = true;
          conversionType = "new"; // força nova venda
        }
      }
    } catch (err) {
      console.error("reactivation detection failed:", err);
    }
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
    is_reactivation: isReactivation,
    previous_churn_at: previousChurnAt,
    gross_amount: grossAmount,
    net_amount: netAmount,
    discount_amount: discountAmount,
    mrr_net: mrrNet,
    coupon_id: couponId,
    coupon_name: couponName,
    coupon_percent_off: couponPercentOff,
    coupon_amount_off: couponAmountOff,
    promotion_code: promotionCode,
    discount_duration: discountDuration,
    discount_duration_in_months: discountDurationInMonths,
    stripe_invoice_id: stripeInvoiceId,
    net_amount_source: netAmountSource,
  };

  const conversionExists = !!existingRow;
  if (!conversionExists) {
    // Insert simples: índices únicos cobrem race conditions
    // ((sub,price) e (customer,price,converted_at)). Em 23505 tratamos como duplicado.
    const { error: convError } = await supabase
      .from("stripe_conversions")
      .insert(conversionRow);

    if (convError && (convError as any).code !== "23505") {
      console.error("Failed to persist conversion:", convError);
      await supabase.from("stripe_events")
        .update({ result: "conversion_failed" })
        .eq("stripe_event_id", event.id);
      return ok({ ok: true, error: "conversion_failed" });
    }
    if (convError && (convError as any).code === "23505") {
      await supabase.from("stripe_events")
        .update({ result: "duplicate:unique_violation" })
        .eq("stripe_event_id", event.id);
      return ok({ ok: true, duplicate: true });
    }

  } else {
    // Idempotente: atualiza datas estáveis e hidrata campos de valor líquido se ainda vazios.
    const patch: Record<string, unknown> = {};
    if (existingRow.converted_at !== finalConvertedAt) patch.converted_at = finalConvertedAt;
    if (existingRow.registered_at !== finalRegisteredAt) patch.registered_at = finalRegisteredAt;
    if (netAmountSource === "invoice") {
      patch.gross_amount = grossAmount;
      patch.net_amount = netAmount;
      patch.discount_amount = discountAmount;
      patch.mrr_net = mrrNet;
      patch.coupon_id = couponId;
      patch.coupon_name = couponName;
      patch.coupon_percent_off = couponPercentOff;
      patch.coupon_amount_off = couponAmountOff;
      patch.promotion_code = promotionCode;
      patch.discount_duration = discountDuration;
      patch.discount_duration_in_months = discountDurationInMonths;
      patch.stripe_invoice_id = stripeInvoiceId;
      patch.net_amount_source = netAmountSource;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("stripe_conversions").update(patch).eq("id", existingRow.id);
    }
  }

  // ─── Validação de consistência do valor líquido (best-effort). ───
  // Roda logo após persistir. Se detectar problema, grava/atualiza um alerta em
  // integration_sync_errors do tipo 'stripe_net_amount_mismatch' que fica visível
  // no painel de Divergências. Não bloqueia a conversão.
  try {
    const convId = existingRow?.id
      ?? (await supabase
            .from("stripe_conversions")
            .select("id")
            .eq("stripe_customer_id", customerId ?? "")
            .eq("stripe_price_id", priceId ?? "")
            .eq("converted_at", finalConvertedAt)
            .maybeSingle()).data?.id;
    if (convId) {
      const { data: issues } = await supabase.rpc("validate_stripe_net_amount", { p_id: convId });
      const list = Array.isArray(issues) ? (issues as string[]) : [];
      if (list.length === 0) {
        await supabase.from("integration_sync_errors")
          .update({ resolved: true })
          .eq("entity_type", "stripe_net_amount_mismatch")
          .eq("ac_id", convId)
          .eq("resolved", false);
      } else {
        const msg = list.join(" | ");
        const { data: existing } = await supabase
          .from("integration_sync_errors")
          .select("id, error_message")
          .eq("entity_type", "stripe_net_amount_mismatch")
          .eq("ac_id", convId)
          .eq("resolved", false)
          .maybeSingle();
        if (!existing) {
          await supabase.from("integration_sync_errors").insert({
            entity_type: "stripe_net_amount_mismatch",
            ac_id: convId,
            error_message: msg,
            payload: { event_id: event.id, event_type: event.type, price_id: priceId, invoice_id: stripeInvoiceId, mrr: convMrr, mrr_net: mrrNet, net_amount: netAmount, discount_amount: discountAmount, coupon_id: couponId },
            resolved: false,
          });
        } else if (existing.error_message !== msg) {
          await supabase.from("integration_sync_errors")
            .update({ error_message: msg, payload: { event_id: event.id, mrr: convMrr, mrr_net: mrrNet, net_amount: netAmount, coupon_id: couponId } })
            .eq("id", existing.id);
        }
      }
    }
  } catch (err) {
    console.error("validate_stripe_net_amount failed:", err);
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

  // Auditoria: reativação detectada (marcada como nova venda)
  if (!conversionExists && isReactivation) {
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_reactivation_detected",
      ac_id: subscriptionId || customerId || event.id,
      error_message: `Reativação detectada: ${normEmail} voltou após churn em ${previousChurnAt}`,
      payload: { event_id: event.id, customer_id: customerId, subscription_id: subscriptionId, price_id: priceId, previous_churn_at: previousChurnAt, converted_at: finalConvertedAt },
      resolved: true,
    });
  }

  await supabase.from("stripe_events")
    .update({ result: conversionExists ? `duplicate:${conversionType}` : `recorded:${conversionType}${isReactivation ? ":reactivation" : ""}` })
    .eq("stripe_event_id", event.id);

  return ok({
    ok: true,
    recorded: !conversionExists,
    conversion_type: conversionType,
    is_reactivation: isReactivation,
    previous_churn_at: previousChurnAt,
    previous_mrr: previousMrr,
    delta_mrr: convMrr - previousMrr,
    assigned_seller_id: assignedSellerId,
    attribution_source: attributionSource,
    area: convArea,
    price_mapped: convArea !== "desconhecida",
  });
});
