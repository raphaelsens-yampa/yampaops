// Backfill de TM1R: para cada conversa sem first_contact_message_at OU first_response_at,
// busca mensagens via /api/v1/.../conversations/{id}/messages e popula os timestamps.
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

async function fetchFirstTimestamps(baseUrl: string, accountId: number, convId: number) {
  let firstIncoming: number | null = null;
  let firstOutgoing: number | null = null;

  // Paginar até esgotar (Chatwoot retorna mais antigas primeiro, mas vamos varrer tudo para garantir)
  let before: number | null = null;
  for (let page = 0; page < 20; page++) {
    const url = before
      ? `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages?before=${before}`
      : `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages`;
    const res = await fetch(url, { headers: { api_access_token: CHATWOOT_API_TOKEN } });
    if (!res.ok) break;
    const j = await res.json();
    const items: any[] = j?.payload || j?.data?.payload || [];
    if (!items.length) break;

    let minId: number | null = null;
    for (const m of items) {
      const ts = Number(m.created_at);
      if (!ts) continue;
      const mt = m.message_type;
      if ((mt === 0 || mt === "incoming") && (firstIncoming == null || ts < firstIncoming)) firstIncoming = ts;
      if ((mt === 1 || mt === "outgoing") && (firstOutgoing == null || ts < firstOutgoing)) firstOutgoing = ts;
      if (m.id && (minId == null || m.id < minId)) minId = m.id;
    }
    if (items.length < 20 || !minId) break;
    before = minId;
  }

  return {
    firstIncoming: firstIncoming ? new Date(firstIncoming * 1000).toISOString() : null,
    firstOutgoing: firstOutgoing ? new Date(firstOutgoing * 1000).toISOString() : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: requires either valid Supabase user JWT or x-cron-secret header
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

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(500, Number(body.limit || 200)));

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

    // Busca conversas sem TM1R completo, mais novas primeiro
    const { data: convs, error } = await service
      .from("chatwoot_conversations")
      .select("chatwoot_conversation_id, first_contact_message_at, first_response_at")
      .or("first_contact_message_at.is.null,first_response_at.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let updated = 0;
    let errors = 0;
    const errSamples: string[] = [];

    const BATCH = 5;
    for (let i = 0; i < (convs || []).length; i += BATCH) {
      const slice = (convs || []).slice(i, i + BATCH);
      await Promise.all(slice.map(async (c: any) => {
        processed++;
        try {
          const { firstIncoming, firstOutgoing } = await fetchFirstTimestamps(baseUrl, accountId, Number(c.chatwoot_conversation_id));
          const patch: Record<string, any> = {};
          if (!c.first_contact_message_at && firstIncoming) patch.first_contact_message_at = firstIncoming;
          if (!c.first_response_at && firstOutgoing) patch.first_response_at = firstOutgoing;
          if (Object.keys(patch).length > 0) {
            const { error: upErr } = await service
              .from("chatwoot_conversations")
              .update(patch)
              .eq("chatwoot_conversation_id", c.chatwoot_conversation_id);
            if (upErr) { errors++; if (errSamples.length < 5) errSamples.push(`${c.chatwoot_conversation_id}: ${upErr.message}`); }
            else updated++;
          }
        } catch (e: any) {
          errors++;
          if (errSamples.length < 5) errSamples.push(`${c.chatwoot_conversation_id}: ${e.message}`);
        }
      }));
      // throttle ~5 req/s
      await new Promise((r) => setTimeout(r, 220));
    }

    // Quanto ainda falta
    const { count: remaining } = await service
      .from("chatwoot_conversations")
      .select("*", { count: "exact", head: true })
      .or("first_contact_message_at.is.null,first_response_at.is.null");

    return new Response(JSON.stringify({
      ok: true,
      processed,
      updated,
      errors,
      error_samples: errSamples,
      remaining_pending: remaining ?? null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
