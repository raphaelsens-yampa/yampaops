// Reaplica commission_price_map (de-para canônico de price_id) sobre stripe_conversions:
// corrige area / plan_name / product_name que ficaram congelados com valores antigos.
// Suporta dry_run para pré-visualizar quantas linhas mudariam. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

  let from: string | null = null;
  let to: string | null = null;
  let dryRun = true;
  let limit = 5000;
  try {
    const body = await req.json();
    if (body?.from) from = String(body.from);
    if (body?.to) to = String(body.to);
    if (typeof body?.dry_run === "boolean") dryRun = body.dry_run;
    if (body?.limit) limit = Math.max(1, Math.min(20000, Number(body.limit)));
  } catch { /* body opcional */ }

  const supabase = createClient(supabaseUrl, serviceKey);

  // De-para canônico
  const { data: mapRows, error: mapErr } = await supabase
    .from("commission_price_map")
    .select("price_id, area, offer_name, plan_name, price_name");
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
    .limit(limit);
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
      changes.push({
        id: c.id as string,
        patch,
        before: { area: c.area, plan_name: c.plan_name, product_name: c.product_name },
      });
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

  return ok({
    scanned: (convs || []).length,
    unmapped,
    would_change: changes.length,
    updated,
    failed,
    dry_run: dryRun,
    sample: changes.slice(0, 20),
  });
});
