// Backfill apenas labels para conversas existentes em chatwoot_conversations.
// Body: { limit?: number, only_empty?: boolean }
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

async function fetchLabels(baseUrl: string, accountId: number, convId: number): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/labels`, {
      headers: { api_access_token: TOKEN },
    });
    if (!res.ok) return [];
    const j = await res.json();
    const arr: any[] = j?.payload || [];
    return Array.from(new Set(arr.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0)));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit || 500), 2000);
    const onlyEmpty = body.only_empty !== false;
    const sinceDate: string | null = body.since || null;
    const beforeDate: string | null = body.before || null;

    const { data: settings } = await service.from("integration_settings").select("chatwoot_base_url, chatwoot_account_id").maybeSingle();
    if (!settings?.chatwoot_base_url || !settings?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "chatwoot not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const baseUrl = settings.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(settings.chatwoot_account_id);

    let q = service.from("chatwoot_conversations").select("chatwoot_conversation_id, labels, opened_at").order("opened_at", { ascending: false }).limit(limit);
    if (onlyEmpty) q = q.or("labels.is.null,labels.eq.{}");
    if (sinceDate) q = q.gte("opened_at", sinceDate);
    if (beforeDate) q = q.lt("opened_at", beforeDate);

    const { data: rows, error } = await q;
    if (error) throw error;

    let updated = 0;
    let withLabels = 0;
    const BATCH = 8;
    for (let i = 0; i < (rows?.length || 0); i += BATCH) {
      const slice = rows!.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(async (r: any) => {
        const labels = await fetchLabels(baseUrl, accountId, Number(r.chatwoot_conversation_id));
        await service.from("chatwoot_conversations")
          .update({ labels })
          .eq("chatwoot_conversation_id", r.chatwoot_conversation_id);
        return labels.length;
      }));
      updated += results.length;
      withLabels += results.filter((n) => n > 0).length;
    }

    return new Response(JSON.stringify({ ok: true, processed: updated, with_labels: withLabels, scanned: rows?.length || 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
