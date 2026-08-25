// Consulta em tempo real na API da Stripe para os e-mails do cohort de campanha.
// Processa em lotes com orçamento de tempo e devolve next_offset para paginação no cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  campaign_id: z.string().uuid(),
  mode: z.enum(["missing", "all"]).default("missing"),
  offset: z.number().int().min(0).default(0),
  batch_size: z.number().int().min(1).max(200).default(40),
  time_budget_ms: z.number().int().min(5000).max(120000).default(60000),
});

function mrrFromPrice(price: any): number {
  if (!price) return 0;
  const amount = Number(price.unit_amount ?? 0) / 100;
  const interval = price.recurring?.interval as string | undefined;
  const count = Number(price.recurring?.interval_count ?? 1) || 1;
  if (!interval) return 0;
  const months = interval === "year" ? 12 * count : interval === "month" ? count : interval === "week" ? count / 4.345 : interval === "day" ? count / 30 : count;
  return months > 0 ? amount / months : 0;
}

const isoDate = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const code = e?.statusCode ?? e?.raw?.statusCode;
      if (code === 429 || code >= 500) {
        await sleep(600 * (i + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY missing" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- Auth: JWT válido + papel admin/tatico
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
  const allowed = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "tatico");
  if (!allowed) return json({ error: "forbidden" }, 403);

  // ---- Body
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const parsed = BodySchema.safeParse(parsedBody);
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { campaign_id, mode, offset, batch_size, time_budget_ms } = parsed.data;

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const startedAt = Date.now();

  // ---- Contatos alvo
  const { data: contacts, error: cErr } = await admin
    .from("campaign_cohort_contacts")
    .select("id, email_norm, email")
    .eq("campaign_id", campaign_id)
    .order("email_norm", { ascending: true });
  if (cErr) return json({ error: cErr.message }, 500);

  let targets = contacts ?? [];
  if (mode === "missing") {
    const { data: res } = await admin
      .from("campaign_cohort_results")
      .select("contact_id, status")
      .eq("campaign_id", campaign_id);
    const identified = new Set(
      (res ?? []).filter((r: any) => r.status && !["never", "unknown"].includes(r.status)).map((r: any) => r.contact_id),
    );
    targets = targets.filter((c: any) => !identified.has(c.id));
  }

  const total = targets.length;
  const slice = targets.slice(offset, offset + batch_size);

  let processed = 0;
  let matched = 0;
  let active = 0;
  let canceled = 0;
  let trial = 0;
  let never = 0;
  const errors: string[] = [];

  for (const c of slice) {
    if (Date.now() - startedAt > time_budget_ms) break;
    const email = String((c as any).email_norm || (c as any).email || "").trim().toLowerCase();
    processed++;
    if (!email) continue;

    try {
      // Cliente na Stripe: search + fallback list
      let customers: any[] = [];
      try {
        const s = await withRetry(() =>
          stripe.customers.search({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: 20 })
        );
        customers = s.data ?? [];
      } catch {
        customers = [];
      }
      if (!customers.length) {
        const l = await withRetry(() => stripe.customers.list({ email, limit: 20 }));
        customers = l.data ?? [];
      }

      let best: { status: string; mrr: number; plan: string | null; started: string | null; canceled: string | null } | null = null;

      for (const cust of customers) {
        const subs = await withRetry(() =>
          stripe.subscriptions.list({
            customer: cust.id,
            status: "all",
            limit: 100,
            expand: ["data.items.data.price"],
          })
        );
        for (const sub of subs.data) {
          const price: any = sub.items?.data?.[0]?.price ?? null;
          const product: any = price?.product ?? null;
          const plan = (typeof product === "object" ? product?.name : null) ?? price?.nickname ?? null;
          const mrr = mrrFromPrice(price) * Number(sub.items?.data?.[0]?.quantity ?? 1);
          const st = String(sub.status);
          const mapped = st === "active" || st === "past_due" || st === "unpaid" ? "active" : st === "trialing" ? "trial" : "canceled";
          const cand = {
            status: mapped,
            mrr: mapped === "canceled" ? mrr : mrr,
            plan,
            started: isoDate((sub as any).start_date ?? sub.created),
            canceled: mapped === "canceled" ? isoDate((sub as any).canceled_at ?? (sub as any).ended_at) : null,
          };
          const rank = (s: string) => (s === "active" ? 0 : s === "trial" ? 1 : 2);
          if (!best || rank(cand.status) < rank(best.status) || (rank(cand.status) === rank(best.status) && cand.mrr > best.mrr)) {
            best = cand;
          }
        }
      }

      const status = best?.status ?? "never";
      if (status === "active") { matched++; active++; }
      else if (status === "trial") { matched++; trial++; }
      else if (status === "canceled") { matched++; canceled++; }
      else never++;

      const row = {
        campaign_id,
        contact_id: (c as any).id,
        email_norm: email,
        status,
        mrr: status === "active" ? Number((best?.mrr ?? 0).toFixed(2)) : status === "canceled" ? Number((best?.mrr ?? 0).toFixed(2)) : 0,
        plan_name: best?.plan ?? null,
        offer_name: best?.plan ?? null,
        origem_cliente: null,
        started_at: best?.started ?? null,
        canceled_at: best?.canceled ?? null,
        churn_type: null,
        source: best ? "stripe_live" : null,
        churn_source: best?.canceled ? "stripe" : null,
        snapshot_date: null,
        computed_at: new Date().toISOString(),
      };

      await admin.from("campaign_cohort_results").delete().eq("campaign_id", campaign_id).eq("contact_id", (c as any).id);
      const { error: insErr } = await admin.from("campaign_cohort_results").insert(row);
      if (insErr) errors.push(`${email}: ${insErr.message}`);
      await sleep(60);
    } catch (e: any) {
      errors.push(`${email}: ${e?.message ?? String(e)}`);
    }
  }

  const nextOffset = offset + processed;
  return json({
    campaign_id,
    mode,
    total,
    offset,
    processed,
    next_offset: nextOffset < total ? nextOffset : null,
    done: nextOffset >= total,
    matched,
    active,
    trial,
    canceled,
    never,
    errors: errors.slice(0, 20),
  });
});
