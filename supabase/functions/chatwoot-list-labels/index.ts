// Returns the full label catalog from the Chatwoot account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN = Deno.env.get("CHATWOOT_API_TOKEN") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: settings } = await service.from("integration_settings").select("chatwoot_base_url, chatwoot_account_id").maybeSingle();
    if (!settings?.chatwoot_base_url || !settings?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "chatwoot not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const baseUrl = settings.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(settings.chatwoot_account_id);

    const res = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/labels`, {
      headers: { api_access_token: TOKEN },
    });
    if (!res.ok) {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: `chatwoot ${res.status}: ${txt}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await res.json();
    const labels = (j?.payload || []).map((l: any) => ({
      title: String(l.title || "").trim(),
      description: l.description || "",
      color: l.color || null,
    })).filter((l: any) => l.title.length > 0);

    return new Response(JSON.stringify({ ok: true, labels }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
