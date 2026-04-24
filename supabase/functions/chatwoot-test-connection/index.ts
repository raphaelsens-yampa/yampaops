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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Read base_url and account_id from integration_settings (latest)
    const { data: settings } = await service
      .from("integration_settings")
      .select("id, chatwoot_base_url, chatwoot_account_id")
      .maybeSingle();

    let body: { base_url?: string; account_id?: number } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }

    const baseUrl = (body.base_url || settings?.chatwoot_base_url || "").replace(/\/$/, "");
    const accountId = body.account_id || settings?.chatwoot_account_id;
    const apiToken = Deno.env.get("CHATWOOT_API_TOKEN");

    if (!baseUrl || !accountId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Configure URL base e Account ID antes de testar." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!apiToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "CHATWOOT_API_TOKEN não configurado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persist URL/account if user passed via body
    if (body.base_url || body.account_id) {
      if (settings?.id) {
        await service
          .from("integration_settings")
          .update({
            chatwoot_base_url: baseUrl,
            chatwoot_account_id: accountId,
          })
          .eq("id", settings.id);
      } else {
        await service.from("integration_settings").insert({
          chatwoot_base_url: baseUrl,
          chatwoot_account_id: accountId,
        });
      }
    }

    // Try Chatwoot profile endpoint
    const url = `${baseUrl}/api/v1/profile`;
    const cwRes = await fetch(url, {
      headers: { api_access_token: apiToken, Accept: "application/json" },
    });
    const text = await cwRes.text();

    if (!cwRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: cwRes.status, error: text.slice(0, 500) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      // ignore
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user: { name: data?.name, email: data?.email, id: data?.id },
        base_url: baseUrl,
        account_id: accountId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
