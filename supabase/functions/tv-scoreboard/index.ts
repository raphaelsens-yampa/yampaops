import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Proxy somente-leitura para a TV: valida o link secreto e libera apenas as
// leituras agregadas que o placar usa (nenhuma tabela com dados de cliente).
const ALLOWED_TABLES = new Set([
  "goal_categories",
  "goals",
  "metas_snapshot_diario",
  "metabase_monthly_agg",
  "goal_growth_baselines",
  "operational_goal_overrides",
]);
const ALLOWED_RPCS = new Set(["tactical_weekly_mrr_actual"]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: { token?: unknown; area?: unknown; path?: unknown; method?: unknown; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const { token, area, path, method, body } = payload;
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return json({ error: "invalid token" }, 400);
  if (area !== "sales" && area !== "cs") return json({ error: "invalid area" }, 400);
  if (typeof path !== "string" || !path.startsWith("/rest/v1/") || path.length > 4000) return json({ error: "invalid path" }, 400);

  const { data: link } = await admin
    .from("tv_display_links")
    .select("id")
    .eq("area", area)
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();
  if (!link) return json({ error: "link inválido ou desativado" }, 401);

  const url = new URL(path, SUPABASE_URL);
  const segments = url.pathname.replace(/^\/rest\/v1\//, "").split("/");
  const isRpc = segments[0] === "rpc";
  if (isRpc) {
    if (method !== "POST" || !ALLOWED_RPCS.has(segments[1] ?? "") || segments.length !== 2) return json({ error: "not allowed" }, 403);
  } else {
    if ((method !== "GET" && method !== "HEAD") || !ALLOWED_TABLES.has(segments[0]) || segments.length !== 1) {
      return json({ error: "not allowed" }, 403);
    }
    // Sem embeds: nada de trazer tabelas relacionadas pelo select.
    if ((url.searchParams.get("select") ?? "").includes("(")) return json({ error: "not allowed" }, 403);
  }

  const upstream = await fetch(`${SUPABASE_URL}${url.pathname}${url.search}`, {
    method: method as string,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: isRpc ? (typeof body === "string" ? body : JSON.stringify(body ?? {})) : undefined,
  });
  const text = await upstream.text();
  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  const range = upstream.headers.get("content-range");
  if (range) headers["Content-Range"] = range;
  return new Response(text, { status: upstream.status, headers });
});
