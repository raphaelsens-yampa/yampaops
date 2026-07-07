// Reprocessa stripe_conversions aplicando a regra de reativação:
// - Consulta subscriptions canceladas e invoices pagas do customer no Stripe
// - Se existe sinal de churn E gap >= reactivation_gap_months, marca is_reactivation
//   e força conversion_type='new' (não sobrescreve upsell/downgrade quando MRR mudou).
// Admin-only.
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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!stripeKey) return ok({ error: "STRIPE_SECRET_KEY missing" }, 500);

  // Auth: exige usuário admin
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return ok({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return ok({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return ok({ error: "forbidden" }, 403);

  const supabase = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let from: string | null = null;
  let to: string | null = null;
  let limit = 500;
  try {
    const body = await req.json();
    if (body?.from) from = String(body.from);
    if (body?.to) to = String(body.to);
    if (body?.limit) limit = Math.max(1, Math.min(2000, Number(body.limit)));
  } catch {}

  // gap configurável
  const { data: settingsRow } = await supabase
    .from("commission_settings")
    .select("reactivation_gap_months")
    .limit(1)
    .maybeSingle();
  const gapMonths = Number((settingsRow as any)?.reactivation_gap_months ?? 2);

  let q = supabase
    .from("stripe_conversions")
    .select("id, stripe_customer_id, stripe_subscription_id, converted_at, conversion_type, previous_mrr, mrr")
    .not("stripe_customer_id", "is", null)
    .not("converted_at", "is", null)
    .order("converted_at", { ascending: true })
    .limit(limit);
  if (from) q = q.gte("converted_at", from);
  if (to) q = q.lte("converted_at", to);
  const { data: rows, error } = await q;
  if (error) return ok({ error: error.message }, 500);

  // cache por customer para não re-buscar
  const cache = new Map<string, { canceledEndedAtMs: number[]; paidMs: number[] }>();
  let scanned = 0, marked = 0, cleared = 0, failed = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    scanned++;
    try {
      const cid = row.stripe_customer_id as string;
      const convTs = new Date(row.converted_at as string).getTime();
      let entry = cache.get(cid);
      if (!entry) {
        const canceledSubs = await stripe.subscriptions.list({ customer: cid, status: "canceled", limit: 20 });
        const canceledEndedAtMs = canceledSubs.data.map(s => (s.ended_at ?? s.canceled_at ?? s.created) * 1000);
        const paidInvoices = await stripe.invoices.list({ customer: cid, status: "paid", limit: 100 });
        const paidMs = paidInvoices.data.map(i => (i.status_transitions?.paid_at ?? i.created) * 1000);
        entry = { canceledEndedAtMs, paidMs };
        cache.set(cid, entry);
      }

      // Filtra sinais estritamente anteriores à conversão atual
      const canceledBefore = entry.canceledEndedAtMs.filter(t => t < convTs);
      const paidBefore = entry.paidMs.filter(t => t < convTs - 86_400_000);
      const lastCanceled = canceledBefore.length ? Math.max(...canceledBefore) : null;
      const lastPaid = paidBefore.length ? Math.max(...paidBefore) : null;
      const referenceMs = Math.max(lastCanceled ?? 0, lastPaid ?? 0) || null;

      let isReactivation = false;
      let previousChurnAt: string | null = null;
      if (referenceMs) {
        previousChurnAt = new Date(referenceMs).toISOString();
        const gapMonthsActual = (convTs - referenceMs) / (1000 * 60 * 60 * 24 * 30.44);
        if ((lastCanceled !== null || lastPaid !== null) && gapMonthsActual >= gapMonths) {
          isReactivation = true;
        }
      }

      // Só força conversion_type='new' quando é renovação/nova (mesmo MRR).
      // Preserva upsell/downgrade — variação de MRR é sinalizada à parte.
      const patch: Record<string, unknown> = {
        is_reactivation: isReactivation,
        previous_churn_at: previousChurnAt,
      };
      if (isReactivation && (row.conversion_type === "renewal" || row.conversion_type === "new")) {
        patch.conversion_type = "new";
      }

      const { error: upErr } = await supabase.from("stripe_conversions").update(patch).eq("id", row.id);
      if (upErr) throw upErr;
      if (isReactivation) marked++;
      else cleared++;
    } catch (e: any) {
      failed++;
      if (errors.length < 20) errors.push(`${row.id}: ${e.message}`);
    }
  }

  return ok({ ok: true, scanned, marked, cleared, failed, gap_months: gapMonths, errors });
});
