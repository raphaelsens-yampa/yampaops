// Helper interno: busca transcrição limpa de uma conversa do Chatwoot.
// Body: { conversation_id: number, max_messages?: number }
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

export async function fetchTranscript(baseUrl: string, accountId: number, convId: number, maxMessages = 200) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages`;
  const res = await fetch(url, { headers: { api_access_token: TOKEN } });
  if (!res.ok) throw new Error(`chatwoot ${res.status}`);
  const j = await res.json();
  const arr: any[] = j?.payload || [];
  // Filtra notas privadas, ordena por created_at, mapeia
  const msgs = arr
    .filter((m) => !m.private)
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    .map((m) => ({
      role: m.message_type === 1 || m.message_type === "outgoing" ? "agente" : "cliente",
      sender: m.sender?.name || (m.message_type === 1 ? "Atendente" : "Cliente"),
      content: String(m.content).replace(/\s+/g, " ").trim(),
      at: m.created_at,
    }));
  // Trunca: primeiras 20 + últimas 60 se exceder
  let truncated = msgs;
  if (msgs.length > maxMessages) {
    truncated = [...msgs.slice(0, 20), ...msgs.slice(-Math.max(maxMessages - 20, 60))];
  }
  return { messages: truncated, total: msgs.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!TOKEN) return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const convId = Number(body.conversation_id);
    if (!convId) return new Response(JSON.stringify({ error: "conversation_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settings } = await service.from("integration_settings").select("chatwoot_base_url, chatwoot_account_id").maybeSingle();
    if (!settings?.chatwoot_base_url || !settings?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "chatwoot not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const baseUrl = settings.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(settings.chatwoot_account_id);
    const result = await fetchTranscript(baseUrl, accountId, convId, Number(body.max_messages || 200));
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
