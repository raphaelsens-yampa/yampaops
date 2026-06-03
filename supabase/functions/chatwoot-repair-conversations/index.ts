// Repara chatwoot_conversations que estão sem chatwoot_contact_id,
// contact_email ou contact_phone. Refaz o fetch via /api/v1/.../conversations/{id}
// e popula os campos. Paginado para rodar em loop.
// Body: { batch_size?: number, max_iters?: number, time_budget_ms?: number, only_missing_cwid?: boolean }

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

function normPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.length > 11 ? d.slice(-11) : d;
}

async function fetchConv(baseUrl: string, accountId: number, convId: number) {
  try {
    const r = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function extractSender(conv: any) {
  const s = conv?.meta?.sender || conv?.contact_inbox?.contact || conv?.sender || {};
  const cwId = s?.id ? Number(s.id) : null;
  const email = (s?.email || "").trim().toLowerCase() || null;
  const phone = s?.phone_number || s?.phone || null;
  const name = s?.name || s?.full_name || null;
  return { cwId, email, phone, name };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!CHATWOOT_API_TOKEN) {
      return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const batchSize: number = Number(body.batch_size || 40);
    const maxIters: number = Number(body.max_iters || 20);
    const timeBudgetMs: number = Number(body.time_budget_ms || 110000);
    const onlyMissingCwid: boolean = body.only_missing_cwid === true;
    const startedAt = Date.now();

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

    let totalRepaired = 0;
    let totalFetched = 0;
    let totalSkipped = 0;
    let lastId: number | null = null;
    const errors: string[] = [];

    for (let iter = 0; iter < maxIters; iter++) {
      if (Date.now() - startedAt > timeBudgetMs) break;

      let q = service
        .from("chatwoot_conversations")
        .select("chatwoot_conversation_id, chatwoot_contact_id, contact_email, contact_phone")
        .order("chatwoot_conversation_id", { ascending: true })
        .limit(batchSize);
      if (onlyMissingCwid) {
        q = q.is("chatwoot_contact_id", null);
      } else {
        // ou cwid nulo, ou (email e phone nulos)
        q = q.or("chatwoot_contact_id.is.null,and(contact_email.is.null,contact_phone.is.null)");
      }
      if (lastId != null) q = q.gt("chatwoot_conversation_id", lastId);

      const { data: rows, error } = await q;
      if (error) { errors.push(`query: ${error.message}`); break; }
      if (!rows || rows.length === 0) break;

      const BATCH = 5;
      for (let i = 0; i < rows.length; i += BATCH) {
        if (Date.now() - startedAt > timeBudgetMs) break;
        const slice = rows.slice(i, i + BATCH);
        const results = await Promise.allSettled(slice.map(async (r: any) => {
          const conv = await fetchConv(baseUrl, accountId, Number(r.chatwoot_conversation_id));
          totalFetched++;
          if (!conv) { totalSkipped++; return; }
          const { cwId, email, phone, name } = extractSender(conv);
          const update: any = {};
          if (cwId != null && r.chatwoot_contact_id == null) update.chatwoot_contact_id = cwId;
          if (email && !r.contact_email) update.contact_email = email;
          if (phone && !r.contact_phone) update.contact_phone = phone;
          if (name) update.contact_name = name;
          if (Object.keys(update).length === 0) { totalSkipped++; return; }
          const { error: upErr } = await service
            .from("chatwoot_conversations")
            .update(update)
            .eq("chatwoot_conversation_id", Number(r.chatwoot_conversation_id));
          if (upErr) throw new Error(upErr.message);
          totalRepaired++;
        }));
        results.forEach((res, idx) => {
          if (res.status === "rejected") errors.push(`conv ${slice[idx].chatwoot_conversation_id}: ${res.reason?.message || res.reason}`);
        });
      }

      lastId = Number(rows[rows.length - 1].chatwoot_conversation_id);
      if (rows.length < batchSize) break;
    }

    return new Response(JSON.stringify({
      ok: true,
      fetched: totalFetched,
      repaired: totalRepaired,
      skipped: totalSkipped,
      last_id: lastId,
      errors: errors.slice(0, 20),
      done: errors.length === 0 && totalFetched === 0,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
