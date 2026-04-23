import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin role
    const userId = claims.claims.sub;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const AC_API_URL = Deno.env.get("AC_API_URL");
    const AC_API_KEY = Deno.env.get("AC_API_KEY");
    if (!AC_API_URL || !AC_API_KEY) {
      return new Response(JSON.stringify({ error: "AC credentials not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = `${AC_API_URL.replace(/\/$/, "")}/api/3/users/me`;
    const acRes = await fetch(url, { headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" } });
    const body = await acRes.text();

    if (!acRes.ok) {
      return new Response(JSON.stringify({ ok: false, status: acRes.status, error: body.slice(0, 500) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = JSON.parse(body);
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("integration_settings").update({ ac_account_url: AC_API_URL }).neq("id", "00000000-0000-0000-0000-000000000000");

    return new Response(JSON.stringify({ ok: true, user: data.user, ac_url: AC_API_URL }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
