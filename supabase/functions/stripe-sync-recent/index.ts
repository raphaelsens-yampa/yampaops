// Sincroniza assinaturas recentes do Stripe (últimas N horas) reprocessando-as
// pelo mesmo pipeline do webhook. Usado por cron a cada 1h para garantir que
// eventuais webhooks perdidos sejam recuperados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROJECT_REF = "wdtdpyibiroufejijsmw";
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  // hours: janela retroativa (default 2h; cap 4320h = 180 dias para permitir recuperação após mudanças no webhook)
  let hours = 2;
  try {
    const body = await req.json();
    if (body?.hours) hours = Math.max(1, Math.min(4320, Number(body.hours)));
  } catch {}

  const sinceUnix = Math.floor((Date.now() - hours * 3600 * 1000) / 1000);

  let processed = 0;
  let alreadyDone = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Paginar todas as assinaturas criadas dentro da janela
    let startingAfter: string | undefined = undefined;
    let pages = 0;
    while (true) {
      const subs = await stripe.subscriptions.list({
        created: { gte: sinceUnix },
        limit: 100,
        status: "all",
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const sub of subs.data) {
        // Pula se já temos conversão para essa subscription
        const { data: existing } = await supabase
          .from("stripe_conversions")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        if (existing) { alreadyDone++; continue; }

        // Event id único por execução (Date.now) — evita colisão com resyncs antigos
        // gravados em stripe_events com id previsível que faria o webhook retornar "duplicate".
        const fakeEvent = {
          id: `internal_resync_${sub.id}_${Date.now()}`,
          type: "customer.subscription.created",
          created: sub.created,
          data: { object: sub },
        };

        try {
          const res = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(fakeEvent),
          });
          if (res.ok) processed++;
          else { failed++; errors.push(`sub ${sub.id}: ${res.status}`); }
        } catch (e: any) {
          failed++;
          errors.push(`sub ${sub.id}: ${e.message}`);
        }
      }
      pages++;
      if (!subs.has_more || pages >= 50) break;
      startingAfter = subs.data[subs.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    window_hours: hours,
    processed,
    already_done: alreadyDone,
    failed,
    errors: errors.slice(0, 10),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
