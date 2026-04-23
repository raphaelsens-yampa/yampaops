import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 };
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error } = await supabase.auth.getClaims(token);
  if (error || !claims?.claims) return { error: "Unauthorized", status: 401 };
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", claims.claims.sub);
  if (!roles?.some((r: any) => r.role === "admin")) return { error: "Forbidden", status: 403 };
  return { userId: claims.claims.sub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) {
      return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const AC_API_URL = Deno.env.get("AC_API_URL")!;
    const AC_API_KEY = Deno.env.get("AC_API_KEY")!;
    const base = AC_API_URL.replace(/\/$/, "");

    // Fetch all pipelines (paginated)
    const allPipelines: any[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(`${base}/api/3/dealGroups?limit=${limit}&offset=${offset}`, {
        headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" },
      });
      if (!res.ok) {
        const txt = await res.text();
        return new Response(JSON.stringify({ error: `AC error ${res.status}: ${txt.slice(0, 300)}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const data = await res.json();
      const groups = data.dealGroups || [];
      allPipelines.push(...groups);
      if (groups.length < limit) break;
      offset += limit;
    }

    // For each pipeline, fetch deal count
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch existing selections to preserve is_selected
    const { data: existing } = await service.from("ac_pipeline_selection").select("ac_pipeline_id, is_selected, local_pipeline_id");
    const existingMap = new Map((existing || []).map((e: any) => [e.ac_pipeline_id, e]));

    const upserts = await Promise.all(
      allPipelines.map(async (p: any) => {
        // Get deals count
        let dealsCount = 0;
        try {
          const cRes = await fetch(`${base}/api/3/deals?filters[group]=${p.id}&limit=1`, {
            headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" },
          });
          if (cRes.ok) {
            const cData = await cRes.json();
            dealsCount = cData.meta?.total ? Number(cData.meta.total) : 0;
          }
        } catch (_) { /* ignore */ }

        const prev = existingMap.get(String(p.id));
        return {
          ac_pipeline_id: String(p.id),
          ac_pipeline_title: p.title || `Pipeline ${p.id}`,
          deals_count: dealsCount,
          is_selected: prev?.is_selected ?? false,
          local_pipeline_id: prev?.local_pipeline_id ?? null,
        };
      }),
    );

    const { error: upsertErr } = await service.from("ac_pipeline_selection").upsert(upserts, { onConflict: "ac_pipeline_id" });
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, count: upserts.length, pipelines: upserts }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
