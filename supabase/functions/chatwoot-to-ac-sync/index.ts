import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const AC_API_URL = (Deno.env.get("AC_API_URL") || "").replace(/\/$/, "");
const AC_API_KEY = Deno.env.get("AC_API_KEY") || "";

async function logError(ref: string | null, message: string, payload: any) {
  try {
    await service.from("integration_sync_errors").insert({
      entity_type: "chatwoot_ac_note",
      ac_id: ref,
      error_message: message,
      payload,
    });
  } catch (_) { /* noop */ }
}

async function acFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${AC_API_URL}${path}`, {
    ...init,
    headers: {
      "Api-Token": AC_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function findAcContactByEmail(email: string): Promise<{ id: string } | null> {
  const r = await acFetch(`/api/3/contacts?email=${encodeURIComponent(email)}&limit=2`);
  if (!r.ok) return null;
  const j = await r.json();
  const list = j.contacts || [];
  if (list.length === 0) return null;
  return { id: String(list[0].id) };
}

async function findAcContactByPhone(phoneDigits: string): Promise<{ id: string } | null> {
  // AC supports filters[phone] as substring; we try last 11/10/9 digits.
  const candidates = Array.from(new Set([phoneDigits, phoneDigits.slice(-11), phoneDigits.slice(-10), phoneDigits.slice(-9)].filter((s) => s.length >= 8)));
  for (const q of candidates) {
    const r = await acFetch(`/api/3/contacts?filters%5Bphone%5D=${encodeURIComponent(q)}&limit=5`);
    if (!r.ok) continue;
    const j = await r.json();
    const list = j.contacts || [];
    if (list.length > 0) return { id: String(list[0].id) };
  }
  return null;
}

function normPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.length > 11 ? d.slice(-11) : d;
}

function buildNoteBody(conv: any, baseUrl: string | null, accountId: number | null): string {
  const link = baseUrl && accountId
    ? `${baseUrl.replace(/\/$/, "")}/app/accounts/${accountId}/conversations/${conv.chatwoot_conversation_id}`
    : `(URL Chatwoot não configurada — conv #${conv.chatwoot_conversation_id})`;
  const when = conv.last_message_at ? new Date(conv.last_message_at).toLocaleString("pt-BR") : "—";
  const lines = [
    `[Chatwoot] Conv #${conv.chatwoot_conversation_id} — ${when}`,
    link,
    `Status: ${conv.status || "—"}${conv.tabulacao_atendimento ? ` · Tabulação: ${conv.tabulacao_atendimento}` : ""}`,
  ];
  if (conv.assignee_name) lines.push(`Atendente: ${conv.assignee_name}`);
  return lines.join("\n");
}

async function upsertNoteForConversation(conversationId: number): Promise<{ ok: boolean; reason?: string; ac_contact_id?: string; ac_note_id?: string }> {
  if (!AC_API_URL || !AC_API_KEY) {
    await logError(String(conversationId), "AC_API_URL/AC_API_KEY não configurados", {});
    return { ok: false, reason: "ac_not_configured" };
  }

  const { data: conv, error: cErr } = await service
    .from("chatwoot_conversations")
    .select("chatwoot_conversation_id, status, tabulacao_atendimento, contact_email, contact_phone, chatwoot_contact_id, last_message_at, assignee_name")
    .eq("chatwoot_conversation_id", conversationId)
    .maybeSingle();

  if (cErr || !conv) {
    await logError(String(conversationId), `Conversa não encontrada: ${cErr?.message || "not_found"}`, {});
    return { ok: false, reason: "conversation_not_found" };
  }

  // Settings for URL
  const { data: settings } = await service.from("integration_settings")
    .select("chatwoot_base_url, chatwoot_account_id").maybeSingle();

  // Collect emails/phones (primary + additional from chatwoot_contacts)
  const emails = new Set<string>();
  const phones = new Set<string>();
  if (conv.contact_email) emails.add(String(conv.contact_email).toLowerCase());
  const phoneNorm = normPhone(conv.contact_phone);
  if (phoneNorm) phones.add(phoneNorm);

  if (conv.chatwoot_contact_id) {
    const { data: cc } = await service.from("chatwoot_contacts")
      .select("email, phone_digits, additional_emails, additional_phones")
      .eq("chatwoot_contact_id", conv.chatwoot_contact_id)
      .maybeSingle();
    if (cc?.email) emails.add(String(cc.email).toLowerCase());
    if (cc?.phone_digits) phones.add(cc.phone_digits);
    for (const e of cc?.additional_emails || []) emails.add(String(e).toLowerCase());
    for (const p of cc?.additional_phones || []) {
      const n = normPhone(p); if (n) phones.add(n);
    }
  }

  // Match: email first, phone fallback
  let acContact: { id: string } | null = null;
  let matchMethod: "email" | "phone" = "email";
  let matchValue: string | null = null;

  for (const e of emails) {
    const r = await findAcContactByEmail(e);
    if (r) { acContact = r; matchMethod = "email"; matchValue = e; break; }
  }
  if (!acContact) {
    for (const p of phones) {
      const r = await findAcContactByPhone(p);
      if (r) { acContact = r; matchMethod = "phone"; matchValue = p; break; }
    }
  }

  if (!acContact) {
    await logError(String(conversationId), "Sem match no AC (email/telefone não encontrado)", {
      emails: Array.from(emails), phones: Array.from(phones),
    });
    return { ok: false, reason: "no_match" };
  }

  const body = buildNoteBody(conv, settings?.chatwoot_base_url || null, settings?.chatwoot_account_id || null);

  // Check existing link
  const { data: existing } = await service.from("chatwoot_ac_note_links")
    .select("id, ac_note_id")
    .eq("chatwoot_conversation_id", conversationId)
    .eq("ac_contact_id", acContact.id)
    .maybeSingle();

  if (existing?.ac_note_id) {
    // PUT update
    const r = await acFetch(`/api/3/notes/${existing.ac_note_id}`, {
      method: "PUT",
      body: JSON.stringify({ note: { note: body, relid: Number(acContact.id), reltype: "Subscriber" } }),
    });
    if (!r.ok) {
      const t = await r.text();
      await logError(String(conversationId), `Falha PUT note: ${r.status} ${t.slice(0, 200)}`, { ac_contact_id: acContact.id });
      return { ok: false, reason: "ac_put_failed" };
    }
    await service.from("chatwoot_ac_note_links")
      .update({ last_synced_at: new Date().toISOString(), match_method: matchMethod, match_value: matchValue })
      .eq("id", existing.id);
    return { ok: true, ac_contact_id: acContact.id, ac_note_id: existing.ac_note_id };
  }

  // POST create
  const createRes = await acFetch(`/api/3/notes`, {
    method: "POST",
    body: JSON.stringify({ note: { note: body, relid: Number(acContact.id), reltype: "Subscriber" } }),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    await logError(String(conversationId), `Falha POST note: ${createRes.status} ${t.slice(0, 200)}`, { ac_contact_id: acContact.id });
    return { ok: false, reason: "ac_post_failed" };
  }
  const created = await createRes.json();
  const noteId = String(created?.note?.id || created?.notes?.[0]?.id || "");
  if (!noteId) {
    await logError(String(conversationId), "Resposta AC sem id de nota", created);
    return { ok: false, reason: "ac_no_id" };
  }

  await service.from("chatwoot_ac_note_links").insert({
    chatwoot_conversation_id: conversationId,
    ac_contact_id: acContact.id,
    ac_note_id: noteId,
    match_method: matchMethod,
    match_value: matchValue,
    last_synced_at: new Date().toISOString(),
  });

  return { ok: true, ac_contact_id: acContact.id, ac_note_id: noteId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = Number(body?.conversation_id);
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await upsertNoteForConversation(conversationId);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
