// Sincroniza as respostas de CSAT do Chatwoot para public.chatwoot_csat_responses.
// Body: { page_start?: number, max_pages?: number, since?: "YYYY-MM-DD", until?: "YYYY-MM-DD" }
// Pagina GET /api/v1/accounts/{id}/csat_survey_responses?page=N
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
  if (!isNaN(n) && n > 1000000000) return new Date(n * 1000).toISOString();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!TOKEN) return json({ error: "CHATWOOT_API_TOKEN missing" }, 500);

    const body = await req.json().catch(() => ({} as any));
    const pageStart = Math.max(Number(body?.page_start) || 1, 1);
    const maxPages = Math.min(Math.max(Number(body?.max_pages) || 10, 1), 100);
    const sinceIso = body?.since ? new Date(`${body.since}T00:00:00-03:00`).toISOString() : null;
    const untilIso = body?.until ? new Date(`${body.until}T23:59:59-03:00`).toISOString() : null;

    const { data: settings } = await service.from("integration_settings")
      .select("chatwoot_base_url, chatwoot_account_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!settings?.chatwoot_base_url || !settings?.chatwoot_account_id) {
      return json({ error: "chatwoot not configured" }, 400);
    }
    const baseUrl = String(settings.chatwoot_base_url).replace(/\/$/, "");
    const accountId = Number(settings.chatwoot_account_id);

    let upserted = 0;
    let pages = 0;
    let lastPage = pageStart - 1;
    let done = false;

    for (let page = pageStart; page < pageStart + maxPages; page++) {
      const url = `${baseUrl}/api/v1/accounts/${accountId}/csat_survey_responses?page=${page}`;
      const res = await fetch(url, { headers: { api_access_token: TOKEN, Accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) {
        console.error("csat fetch failed", page, res.status, text.slice(0, 300));
        return json({ error: `chatwoot ${res.status}`, detail: text.slice(0, 300), pages, upserted }, 502);
      }
      let parsed: any = {};
      try { parsed = JSON.parse(text); } catch { parsed = {}; }
      const list: any[] = Array.isArray(parsed)
        ? parsed
        : (parsed?.payload || parsed?.csat_survey_responses || parsed?.data || []);

      pages++;
      lastPage = page;
      if (!Array.isArray(list) || list.length === 0) { done = true; break; }

      const rows = list.map((r: any) => {
        const conv = r?.conversation || {};
        const contact = r?.contact || {};
        const assignee = r?.assigned_agent || r?.assignee || conv?.meta?.assignee || {};
        const respondedAt = tsToIso(r?.updated_at || r?.created_at);
        return {
          chatwoot_account_id: accountId,
          chatwoot_conversation_id: Number(conv?.id ?? r?.conversation_id ?? 0),
          csat_id: r?.id ? Number(r.id) : null,
          rating: r?.rating != null ? Number(r.rating) : null,
          feedback_message: r?.feedback_message ?? null,
          contact_name: contact?.name ?? null,
          contact_email: contact?.email ? String(contact.email).toLowerCase() : null,
          contact_phone: contact?.phone_number ?? null,
          assignee_name: assignee?.name ?? assignee?.available_name ?? null,
          assignee_email: assignee?.email ? String(assignee.email).toLowerCase() : null,
          team_name: conv?.team?.name ?? r?.team?.name ?? null,
          inbox_name: conv?.inbox?.name ?? r?.inbox?.name ?? null,
          responded_at: respondedAt,
        };
      }).filter((r) =>
        r.chatwoot_conversation_id > 0 &&
        (!sinceIso || !r.responded_at || r.responded_at >= sinceIso) &&
        (!untilIso || !r.responded_at || r.responded_at <= untilIso)
      );

      if (rows.length) {
        const { error } = await service.from("chatwoot_csat_responses")
          .upsert(rows, { onConflict: "chatwoot_conversation_id" });
        if (error) {
          console.error("csat upsert error", error.message);
          return json({ error: error.message, pages, upserted }, 500);
        }
        upserted += rows.length;
      }
    }

    // Enriquece time/caixa de entrada a partir das conversas já sincronizadas.
    const { data: pending } = await service.from("chatwoot_csat_responses")
      .select("chatwoot_conversation_id")
      .is("team_name", null)
      .limit(2000);
    const pendingIds = (pending || []).map((r: any) => Number(r.chatwoot_conversation_id));
    let enriched = 0;
    for (let i = 0; i < pendingIds.length; i += 200) {
      const slice = pendingIds.slice(i, i + 200);
      const { data: convs } = await service.from("chatwoot_conversations")
        .select("chatwoot_conversation_id, team_name, inbox_name")
        .in("chatwoot_conversation_id", slice);
      for (const c of convs || []) {
        if (!c?.team_name && !c?.inbox_name) continue;
        const { error } = await service.from("chatwoot_csat_responses")
          .update({ team_name: c.team_name ?? null, inbox_name: c.inbox_name ?? null })
          .eq("chatwoot_conversation_id", c.chatwoot_conversation_id);
        if (!error) enriched++;
      }
    }

    const { count } = await service.from("chatwoot_csat_responses")
      .select("id", { count: "exact", head: true });

    return json({ ok: true, pages, upserted, enriched, last_page: lastPage, done, total_in_db: count || 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("csat sync error", msg);
    return json({ error: msg }, 500);
  }
});
