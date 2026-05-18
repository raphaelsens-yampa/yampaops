// Sincroniza mensagens individuais do Chatwoot para a tabela chatwoot_messages.
// Body: { since?: "YYYY-MM-DD", until?: "YYYY-MM-DD", max_conversations?: number }
// Estratégia: pega conversas em chatwoot_conversations no range e busca /messages de cada uma.
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

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  const n = Number(v);
  if (!isNaN(n) && n > 0) return new Date(n * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function classifySender(mt: any): "agent" | "client" | "system" {
  if (mt === 0 || mt === "incoming") return "client";
  if (mt === 1 || mt === "outgoing") return "agent";
  return "system";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const sinceIso = body.since ? new Date(`${body.since}T00:00:00Z`).toISOString() : new Date(Date.now() - 7 * 86400_000).toISOString();
    const untilIso = body.until ? new Date(`${body.until}T23:59:59Z`).toISOString() : new Date().toISOString();
    const maxConvs = Math.min(Number(body.max_conversations || 5000), 20000);

    const { data: settings } = await service.from("integration_settings")
      .select("chatwoot_base_url, chatwoot_account_id").maybeSingle();
    if (!settings?.chatwoot_base_url || !settings?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "chatwoot not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const baseUrl = settings.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(settings.chatwoot_account_id);

    // Conversas alvo (já sincronizadas em chatwoot_conversations)
    const convs: any[] = [];
    let from = 0;
    const page = 1000;
    while (true) {
      const { data, error } = await service
        .from("chatwoot_conversations")
        .select("chatwoot_conversation_id, chatwoot_account_id, chatwoot_inbox_id, inbox_name")
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: false })
        .range(from, from + page - 1);
      if (error) throw error;
      convs.push(...(data || []));
      if (!data || data.length < page) break;
      from += page;
      if (convs.length >= maxConvs) break;
    }

    let totalMessages = 0;
    let inserted = 0;
    let convsOk = 0;
    let convsErr = 0;

    for (const c of convs.slice(0, maxConvs)) {
      const convId = Number(c.chatwoot_conversation_id);
      try {
        const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages`;
        const res = await fetch(url, { headers: { api_access_token: TOKEN } });
        if (!res.ok) { convsErr++; continue; }
        const j = await res.json();
        const arr: any[] = j?.payload || [];
        if (!arr.length) { convsOk++; continue; }
        totalMessages += arr.length;

        const rows = arr.map((m) => {
          const senderType = classifySender(m.message_type);
          const senderName = m.sender?.name || null;
          const senderEmail = m.sender?.email || null;
          const senderId = m.sender?.id ? Number(m.sender.id) : null;
          return {
            chatwoot_message_id: Number(m.id),
            chatwoot_conversation_id: convId,
            chatwoot_account_id: accountId,
            chatwoot_inbox_id: c.chatwoot_inbox_id || null,
            inbox_name: c.inbox_name || null,
            sender_type: senderType,
            sender_id: senderId,
            sender_name: senderName,
            sender_email: senderEmail,
            message_type: typeof m.message_type === "number" ? m.message_type : null,
            content_preview: typeof m.content === "string" ? m.content.slice(0, 500) : null,
            is_private: !!m.private,
            message_created_at: tsToIso(m.created_at) || new Date().toISOString(),
          };
        }).filter((r) => r.chatwoot_message_id);

        if (rows.length) {
          const { error: upErr, count } = await service
            .from("chatwoot_messages")
            .upsert(rows, { onConflict: "chatwoot_message_id", count: "exact", ignoreDuplicates: false });
          if (upErr) { convsErr++; continue; }
          inserted += count || rows.length;
        }
        convsOk++;
      } catch (_e) {
        convsErr++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      since: sinceIso,
      until: untilIso,
      conversations_scanned: convs.length,
      conversations_ok: convsOk,
      conversations_err: convsErr,
      messages_fetched: totalMessages,
      messages_upserted: inserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
