// Preenche inbox_name nas conversas existentes buscando lista de inboxes do Chatwoot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CHATWOOT_API_TOKEN = Deno.env.get("CHATWOOT_API_TOKEN") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const providedCron = req.headers.get("x-cron-secret") || "";
  const isCron = cronSecret && providedCron === cronSecret;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    if (!CHATWOOT_API_TOKEN) {
      return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await service
      .from("integration_settings")
      .select("chatwoot_base_url, chatwoot_account_id")
      .maybeSingle();
    if (!settings?.chatwoot_base_url || !settings?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "Chatwoot not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const baseUrl = settings.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(settings.chatwoot_account_id);

    // 1. Buscar todas as inboxes
    const res = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/inboxes`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `inboxes fetch failed: ${res.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await res.json();
    const inboxes: any[] = j?.payload || j?.data || [];
    const map = new Map<number, string>();
    for (const ix of inboxes) {
      if (ix?.id && ix?.name) map.set(Number(ix.id), String(ix.name));
    }

    // 2. Atualizar conversas com inbox_id mas sem inbox_name
    let updated = 0;
    const updates: Record<number, string> = {};
    for (const [id, name] of map.entries()) {
      const { error, count } = await service
        .from("chatwoot_conversations")
        .update({ inbox_name: name }, { count: "exact" })
        .eq("chatwoot_inbox_id", id)
        .is("inbox_name", null);
      if (!error) {
        updated += count || 0;
        updates[id] = name;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      inboxes_found: map.size,
      inbox_map: Object.fromEntries(map),
      conversations_updated: updated,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
