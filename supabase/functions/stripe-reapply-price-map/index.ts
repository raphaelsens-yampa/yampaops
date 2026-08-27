// Reaplica commission_price_map (de-para canônico de price_id) sobre stripe_conversions:
// corrige area / plan_name / product_name que ficaram congelados com valores antigos.
// Suporta dry_run para pré-visualizar quantas linhas mudariam. Admin-only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return ok({ error: "server configuration missing" }, 500);

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

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    return ok({ error: "invalid JSON body" }, 400);
  }

  const from = body.from === undefined ? null : body.from;
  const to = body.to === undefined ? null : body.to;
  if (from !== null && !validIsoDate(from)) return ok({ error: "from must be an ISO timestamp" }, 400);
  if (to !== null && !validIsoDate(to)) return ok({ error: "to must be an ISO timestamp" }, 400);
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) return ok({ error: "from must be before to" }, 400);

  const dryRun = body.dry_run === undefined ? true : body.dry_run;
  if (typeof dryRun !== "boolean") return ok({ error: "dry_run must be boolean" }, 400);
  const requestedLimit = body.limit === undefined ? 5000 : Number(body.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20000) {
    return ok({ error: "limit must be an integer between 1 and 20000" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: mapRows, error: mapErr } = await supabase
    .from("commission_price_map")
    .select("price_id, area, offer_name, plan_name");
  if (mapErr) return ok({ error: mapErr.message }, 500);

  const priceMap = new Map<string, { area: string | null; offer_name: string | null; plan_name: string | null }>();
  for (const m of mapRows || []) {
    if (m.price_id) priceMap.set(m.price_id, { area: m.area, offer_name: m.offer_name, plan_name: m.plan_name });
  }

  let q = supabase
    .from("stripe_conversions")
    .select("id, stripe_price_id, area, plan_name, product_name, converted_at")
    .not("stripe_price_id", "is", null)
    .order("converted_at", { ascending: false })
    .limit(requestedLimit);
  if (from) q = q.gte("converted_at", from);
  if (to) q = q.lte("converted_at", to);

  const { data: convs, error: convErr } = await q;
  if (convErr) return ok({ error: convErr.message }, 500);

  const changes: Array<{ id: string; patch: Record<string, unknown>; before: Record<string, unknown> }> = [];
  let unmapped = 0;
  for (const c of convs || []) {
    const m = priceMap.get(c.stripe_price_id as string);
    if (!m) { unmapped++; continue; }
    const patch: Record<string, unknown> = {};
    if (m.area && m.area !== c.area) patch.area = m.area;
    if (m.plan_name && m.plan_name !== c.plan_name) patch.plan_name = m.plan_name;
    if (m.offer_name && m.offer_name !== c.product_name) patch.product_name = m.offer_name;
    if (Object.keys(patch).length > 0) {
      changes.push({ id: c.id as string, patch, before: { area: c.area, plan_name: c.plan_name, product_name: c.product_name } });
    }
  }

  let updated = 0;
  let failed = 0;
  if (!dryRun) {
    for (const ch of changes) {
      const { error } = await supabase.from("stripe_conversions").update(ch.patch).eq("id", ch.id);
      if (error) failed++; else updated++;
    }
  }

  return ok({ scanned: (convs || []).length, unmapped, would_change: changes.length, updated, failed, dry_run: dryRun, sample: changes.slice(0, 20) });
});
