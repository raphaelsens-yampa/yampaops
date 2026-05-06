// Backfill de conversas do Chatwoot para a tabela chatwoot_conversations.
// Uso: invoke com body { since: "2026-04-01" }
// Lista conversas via /api/v2/.../reports/conversations_filter (paginado),
// e para cada uma busca detalhes em /api/v1/.../conversations/{id}.

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

function normPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  const n = Number(v);
  if (!isNaN(n) && n > 0) return new Date(n * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractTabulacao(conv: any): string | null {
  const sources = [conv?.custom_attributes, conv?.additional_attributes, conv?.meta?.custom_attributes].filter(Boolean);
  const keys = [
    "tabulacao_atendimentos", "tabulacao_atendimento",
    "tabulacaoAtendimentos", "tabulacaoAtendimento",
    "tabulacao-atendimentos", "tabulacao-atendimento",
    "Tabulação Atendimentos", "Tabulação Atendimento",
    "tabulação_atendimentos", "tabulação_atendimento",
  ];
  for (const src of sources) {
    for (const k of keys) {
      const v = src?.[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
  }
  return null;
}

async function findOrCreateContact(p: { email: string | null; phone: string | null; name: string | null }) {
  const { email, phone, name } = p;
  if (email) {
    const { data } = await service.from("contacts").select("id").ilike("email", email).maybeSingle();
    if (data?.id) return data.id;
  }
  const phoneDigits = normPhone(phone);
  if (phoneDigits) {
    const { data: rows } = await service.from("contacts").select("id, phone").not("phone", "is", null);
    const match = (rows || []).find((c: any) => normPhone(c.phone) === phoneDigits);
    if (match) return match.id;
  }
  if (!email && !phoneDigits && !name) return null;
  const { data: created } = await service.from("contacts").insert({
    name: name || email || phone || "Contato Chatwoot",
    email: email || null,
    phone: phone || null,
  }).select("id").single();
  return created?.id || null;
}

async function findActiveOpportunity(contactId: string): Promise<string | null> {
  const { data } = await service
    .from("opportunities")
    .select("id")
    .eq("contact_id", contactId)
    .eq("is_active", true)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id || null;
}

async function processConversation(conv: any, accountId: number) {
  const sender = conv?.meta?.sender || conv?.contact_inbox?.contact || conv?.sender || {};
  const email = (sender.email || "").trim().toLowerCase() || null;
  const phone = sender.phone_number || sender.phone || null;
  const name = sender.name || sender.full_name || null;

  const contactId = await findOrCreateContact({ email, phone, name });
  const opportunityId = contactId ? await findActiveOpportunity(contactId) : null;

  const convId = Number(conv.id);
  if (!convId) return;

  const status = conv.status || "open";
  const tabulacao = extractTabulacao(conv);
  const openedAt = tsToIso(conv.created_at) || tsToIso(conv.timestamp);
  const lastMsgAt = tsToIso(conv.last_activity_at) || openedAt || new Date().toISOString();

  const assignee = conv?.meta?.assignee || conv?.assignee || null;
  const team = conv?.meta?.team || conv?.team || null;

  const closedAt = status === "resolved"
    ? (tsToIso(conv.resolved_at) || tsToIso(conv.last_activity_at) || new Date().toISOString())
    : null;

  const inboxId = conv.inbox_id ? Number(conv.inbox_id) : null;

  await service.from("chatwoot_conversations").upsert({
    chatwoot_conversation_id: convId,
    chatwoot_account_id: accountId,
    chatwoot_inbox_id: inboxId,
    status,
    tabulacao_atendimento: tabulacao,
    contact_id: contactId,
    opportunity_id: opportunityId,
    contact_email: email,
    contact_phone: phone,
    contact_name: name,
    last_message_at: lastMsgAt,
    opened_at: openedAt,
    conversation_closed_at: closedAt,
    assignee_id: assignee?.id ? Number(assignee.id) : null,
    assignee_name: assignee?.name || assignee?.available_name || null,
    assignee_email: assignee?.email || null,
    team_id: team?.id ? Number(team.id) : null,
    team_name: team?.name || null,
  }, { onConflict: "chatwoot_conversation_id" });
}

async function fetchConversation(baseUrl: string, accountId: number, convId: number) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}`;
  const res = await fetch(url, { headers: { api_access_token: CHATWOOT_API_TOKEN } });
  if (!res.ok) return null;
  return await res.json();
}

async function listConversations(baseUrl: string, accountId: number, since: string, page: number) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/filter?page=${page}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      api_access_token: CHATWOOT_API_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: [
        { attribute_key: "created_at", filter_operator: "is_greater_than", values: [since], attribute_model: "standard" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { items: j?.payload || [], meta: j?.meta || {} };
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
    const since: string = body.since || "2026-04-01";
    const sinceDate = new Date(`${since}T00:00:00Z`);
    if (isNaN(sinceDate.getTime())) {
      return new Response(JSON.stringify({ error: "invalid since" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sinceUnix = Math.floor(sinceDate.getTime() / 1000);

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

    let page = 1;
    let totalProcessed = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    const MAX_PAGES = 100;

    while (page <= MAX_PAGES) {
      let listResp: { items: any[]; meta: any };
      try {
        listResp = await listConversations(baseUrl, accountId, sinceUnix, page);
      } catch (e: any) {
        errors.push(`page ${page}: ${e.message}`);
        break;
      }
      const items = listResp.items || [];
      if (!items.length) break;

      let pageHadOlder = false;
      for (const it of items) {
        const created = Number(it.created_at || 0);
        if (created && created < sinceUnix) {
          pageHadOlder = true;
          totalSkipped++;
          continue;
        }
        try {
          // Fetch full conversation to get custom_attributes + meta
          const full = await fetchConversation(baseUrl, accountId, Number(it.id));
          await processConversation(full || it, accountId);
          totalProcessed++;
        } catch (e: any) {
          errors.push(`conv ${it.id}: ${e.message}`);
        }
      }

      // If the API doesn't filter by since, stop when results are entirely older
      if (pageHadOlder && items.every((it) => Number(it.created_at || 0) < sinceUnix)) break;

      page++;
    }

    return new Response(JSON.stringify({
      ok: true, since, processed: totalProcessed, skipped_older: totalSkipped, pages: page - 1, errors,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
