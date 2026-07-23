// Backfill de eventos de churn (assinaturas Stripe canceladas) para stripe_churn_events.
// Público na malha Lovable, protegido por validação de JWT em código.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !supabaseUrl || !anonKey || !serviceKey) {
    return ok({ error: "Server misconfigured" }, 500);
  }

  // Auth: exige admin/tatico
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return ok({ error: "Unauthorized" }, 401);
  const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: authErr } = await authed.auth.getClaims(token);
  if (authErr || !claims?.claims?.sub) return ok({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: allowed } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "tatico"]);
  if (!allowed?.length) return ok({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({} as any));
  const fromTs = body?.from ? Math.floor(new Date(body.from).getTime() / 1000) : undefined;
  const toTs = body?.to ? Math.floor(new Date(body.to).getTime() / 1000) : undefined;
  const maxPages = Math.min(Math.max(Number(body?.max_pages) || 20, 1), 60);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let startingAfter: string | undefined = undefined;
  const errors: string[] = [];

  for (let page = 0; page < maxPages; page++) {
    const params: any = { status: "canceled", limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    if (fromTs || toTs) params.created = { ...(fromTs ? { gte: fromTs } : {}), ...(toTs ? { lte: toTs } : {}) };

    let resp: Stripe.ApiList<Stripe.Subscription>;
    try {
      resp = await stripe.subscriptions.list(params);
    } catch (err) {
      errors.push(`page ${page}: ${(err as Error).message}`);
      break;
    }

    for (const sub of resp.data) {
      scanned++;
      const canceledAtSec = sub.canceled_at || sub.ended_at;
      if (!canceledAtSec) { skipped++; continue; }
      if (fromTs && canceledAtSec < fromTs) { skipped++; continue; }
      if (toTs && canceledAtSec > toTs) { skipped++; continue; }

      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null;
      const priceId = sub.items?.data?.[0]?.price?.id || null;
      const reason = (sub as any).cancellation_details?.reason || (sub as any).cancellation_details?.feedback || null;

      let mrrLost = 0;
      let planName: string | null = null;
      let stripeArea: string | null = null;
      let assignedSellerId: string | null = null;
      let email: string | null = null;

      const { data: prev } = await admin.from("stripe_conversions")
        .select("mrr, mrr_net, plan_name, product_name, area, assigned_seller_id, customer_email, converted_at")
        .eq("stripe_customer_id", customerId || "__none__")
        .order("converted_at", { ascending: false })
        .limit(1);
      const row: any = prev?.[0];
      if (row) {
        mrrLost = Number(row.mrr_net) > 0 ? Number(row.mrr_net) : (Number(row.mrr) || 0);
        planName = row.plan_name || row.product_name || null;
        stripeArea = row.area || null;
        assignedSellerId = row.assigned_seller_id || null;
        email = row.customer_email || null;
      }

      const { data: existing } = await admin.from("stripe_churn_events")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();

      const payload = {
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        customer_email: email,
        canceled_at: new Date(canceledAtSec * 1000).toISOString(),
        mrr_lost: mrrLost,
        plan_name: planName,
        stripe_price_id: priceId,
        stripe_area: stripeArea,
        assigned_seller_id: assignedSellerId,
        cancellation_reason: reason,
        source: "backfill",
        raw_event: sub as unknown as Record<string, unknown>,
      };

      if (existing?.id) {
        const { error } = await admin.from("stripe_churn_events").update(payload).eq("id", existing.id);
        if (error) errors.push(`sub ${sub.id}: ${error.message}`);
        else updated++;
      } else {
        const { error } = await admin.from("stripe_churn_events").insert(payload);
        if (error) errors.push(`sub ${sub.id}: ${error.message}`);
        else inserted++;
      }
    }

    if (!resp.has_more) break;
    startingAfter = resp.data[resp.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return ok({ scanned, inserted, updated, skipped, errors: errors.slice(0, 10) });
});
