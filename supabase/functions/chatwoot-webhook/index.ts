import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chatwoot-signature",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CHATWOOT_WEBHOOK_SECRET = Deno.env.get("CHATWOOT_WEBHOOK_SECRET") || "";

async function logError(entity_type: string, ref: string | null, error_message: string, payload: any) {
  try {
    await service.from("integration_sync_errors").insert({
      entity_type,
      ac_id: ref,
      error_message,
      payload,
    });
  } catch (_) { /* ignore */ }
}

async function verifyHmac(rawBody: string, sigHeader: string | null): Promise<boolean> {
  // Chatwoot doesn't sign by default. If no signature or no secret, accept.
  if (!sigHeader || !CHATWOOT_WEBHOOK_SECRET) return true;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(CHATWOOT_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.toLowerCase() === sigHeader.toLowerCase().replace(/^sha256=/, "");
}

function normPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

async function fallbackUserId(): Promise<string | null> {
  // Pick the first admin as the system user for activities
  const { data } = await service
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

async function findOrCreateContact(payload: {
  email: string | null;
  phone: string | null;
  name: string | null;
}): Promise<string | null> {
  const { email, phone, name } = payload;

  // 1) Match by email (primary)
  if (email) {
    const { data } = await service
      .from("contacts")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 2) Match by phone digits (secondary)
  const phoneDigits = normPhone(phone);
  if (phoneDigits) {
    // Use raw filter via RPC-less path: select all candidates and match in JS (small dataset acceptable for new contacts)
    const { data: rows } = await service.from("contacts").select("id, phone").not("phone", "is", null);
    const match = (rows || []).find((c: any) => normPhone(c.phone) === phoneDigits);
    if (match) return match.id;
  }

  // 3) Create new contact (only if we have at least an email or phone to identify it)
  if (!email && !phoneDigits && !name) return null;

  const { data: created, error } = await service
    .from("contacts")
    .insert({
      name: name || email || phone || "Contato Chatwoot",
      email: email || null,
      phone: phone || null,
    })
    .select("id")
    .single();

  if (error) {
    await logError("chatwoot_contact", email || phone, error.message, payload);
    return null;
  }
  return created.id;
}

async function findActiveOpportunity(contactId: string): Promise<string | null> {
  const { data } = await service
    .from("opportunities")
    .select("id, last_interaction_at, created_at")
    .eq("contact_id", contactId)
    .eq("is_active", true)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id || null;
}

type ResolvedContext = {
  contactId: string | null;
  opportunityId: string | null;
  email: string | null;
  phone: string | null;
};

type ResolvedContextX = ResolvedContext & { name: string | null };

async function resolveContext(conversation: any): Promise<ResolvedContextX> {
  const sender =
    conversation?.meta?.sender ||
    conversation?.contact_inbox?.contact ||
    conversation?.sender ||
    {};
  const email = (sender.email || "").trim().toLowerCase() || null;
  const phone = sender.phone_number || sender.phone || null;
  const name = sender.name || sender.full_name || null;

  const contactId = await findOrCreateContact({ email, phone, name });
  const opportunityId = contactId ? await findActiveOpportunity(contactId) : null;
  return { contactId, opportunityId, email, phone, name };
}

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  const n = Number(v);
  if (!isNaN(n) && n > 0) return new Date(n * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractTabulacao(conversation: any): string | null {
  const sources = [
    conversation?.custom_attributes,
    conversation?.additional_attributes,
    conversation?.meta?.custom_attributes,
  ].filter(Boolean);
  const keys = [
    "tabulacao_atendimentos",
    "tabulacao_atendimento",
    "tabulacaoAtendimentos",
    "tabulacaoAtendimento",
    "tabulacao-atendimentos",
    "tabulacao-atendimento",
    "Tabulação Atendimentos",
    "Tabulação Atendimento",
    "tabulação_atendimentos",
    "tabulação_atendimento",
  ];
  for (const src of sources) {
    for (const k of keys) {
      const v = src?.[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
  }
  return null;
}

async function upsertConversation(
  conversation: any,
  ctx: ResolvedContextX,
): Promise<void> {
  const convId = Number(conversation.id);
  if (!convId) return;
  const accountId = Number(conversation.account_id || conversation.inbox?.account_id || 0);
  const inboxId = conversation.inbox_id ? Number(conversation.inbox_id) : null;
  const status = conversation.status || "open";
  const tabulacao = extractTabulacao(conversation);
  const lastMsgAt = tsToIso(conversation.last_activity_at) || new Date().toISOString();
  const openedAt = tsToIso(conversation.created_at) || tsToIso(conversation.timestamp);

  const assignee = conversation?.meta?.assignee || conversation?.assignee || null;
  const team = conversation?.meta?.team || conversation?.team || null;

  // Lookup current row to (a) preserve agent/team frozen at close time
  // and (b) keep an existing closed timestamp.
  const { data: existing } = await service
    .from("chatwoot_conversations")
    .select("conversation_closed_at, assignee_id, assignee_name, assignee_email, team_id, team_name, status")
    .eq("chatwoot_conversation_id", convId)
    .maybeSingle();

  // Determine closed_at: if resolved, use existing or now()
  let closedAt: string | null = existing?.conversation_closed_at || null;
  if (status === "resolved" && !closedAt) {
    closedAt = tsToIso(conversation.resolved_at)
      || tsToIso(conversation.last_activity_at)
      || new Date().toISOString();
  }

  // Freeze assignee/team if the conversation was already resolved.
  // Otherwise (open/pending), keep refreshing with the latest values.
  const wasResolved = existing?.status === "resolved" && !!existing?.conversation_closed_at;

  const incomingAssignee = {
    id: assignee?.id ? Number(assignee.id) : null,
    name: assignee?.name || assignee?.available_name || null,
    email: assignee?.email || null,
  };
  const incomingTeam = {
    id: team?.id ? Number(team.id) : null,
    name: team?.name || null,
  };

  const finalAssignee = wasResolved
    ? { id: existing?.assignee_id ?? null, name: existing?.assignee_name ?? null, email: existing?.assignee_email ?? null }
    : incomingAssignee;
  const finalTeam = wasResolved
    ? { id: existing?.team_id ?? null, name: existing?.team_name ?? null }
    : incomingTeam;

  const row: any = {
    chatwoot_conversation_id: convId,
    chatwoot_account_id: accountId,
    chatwoot_inbox_id: inboxId,
    status,
    tabulacao_atendimento: tabulacao,
    contact_id: ctx.contactId,
    opportunity_id: ctx.opportunityId,
    contact_email: ctx.email,
    contact_phone: ctx.phone,
    contact_name: ctx.name,
    last_message_at: lastMsgAt,
    opened_at: openedAt,
    conversation_closed_at: closedAt,
    assignee_id: finalAssignee.id,
    assignee_name: finalAssignee.name,
    assignee_email: finalAssignee.email,
    team_id: finalTeam.id,
    team_name: finalTeam.name,
  };

  const { error } = await service.from("chatwoot_conversations").upsert(
    row,
    { onConflict: "chatwoot_conversation_id" },
  );
  if (error) await logError("chatwoot_conversation", String(convId), error.message, conversation);
}

async function bumpOpportunityInteraction(opportunityId: string | null) {
  if (!opportunityId) return;
  await service
    .from("opportunities")
    .update({ last_interaction_at: new Date().toISOString() })
    .eq("id", opportunityId);
}

// =====================================================
// Tag automation by Chatwoot event
// =====================================================
const TAG_SLUG_BY_EVENT: Record<string, string> = {
  conversation_created: "chatwoot-conversation-created",
  conversation_updated: "chatwoot-conversation-updated",
  conversation_status_changed: "chatwoot-conversation-closed",
  message_replied: "chatwoot-message-replied", // virtual key for incoming message
};

const tagIdCache = new Map<string, string | null>();

async function resolveTagId(slug: string): Promise<string | null> {
  if (tagIdCache.has(slug)) return tagIdCache.get(slug) ?? null;
  const { data } = await service.from("tags").select("id").eq("slug", slug).maybeSingle();
  const id = data?.id ?? null;
  tagIdCache.set(slug, id);
  return id;
}

async function applyTagForEvent(opportunityId: string | null, virtualEvent: string) {
  if (!opportunityId) return;
  const slug = TAG_SLUG_BY_EVENT[virtualEvent];
  if (!slug) return;
  const tagId = await resolveTagId(slug);
  if (!tagId) return;

  const { error } = await service.from("opportunity_tags").upsert(
    { opportunity_id: opportunityId, tag_id: tagId },
    { onConflict: "opportunity_id,tag_id", ignoreDuplicates: true },
  );
  if (error) {
    await logError("chatwoot_tag", `${opportunityId}/${slug}`, error.message, { opportunityId, slug });
  }
}

async function bumpLastEvent() {
  const { data: settings } = await service
    .from("integration_settings")
    .select("id")
    .maybeSingle();
  const ts = new Date().toISOString();
  if (settings?.id) {
    await service
      .from("integration_settings")
      .update({ chatwoot_last_event_at: ts })
      .eq("id", settings.id);
  } else {
    await service.from("integration_settings").insert({ chatwoot_last_event_at: ts });
  }
}

async function createActivity(opts: {
  type: "mensagem_enviada" | "resposta_recebida" | "chatwoot_status_change";
  notes: string;
  conversationId: number;
  messageId?: number | null;
  opportunityId: string | null;
  userId: string;
}) {
  const { type, notes, conversationId, messageId, opportunityId, userId } = opts;

  // Idempotency: skip if message_id already inserted
  if (messageId) {
    const { data: dup } = await service
      .from("activities")
      .select("id")
      .eq("chatwoot_message_id", messageId)
      .maybeSingle();
    if (dup) return { ok: true, deduped: true };
  }

  // activities.lead_id is NOT NULL → if no opportunity, skip activity (we still keep chatwoot_conversations row)
  if (!opportunityId) {
    return { ok: true, skipped: true, reason: "no_opportunity" };
  }

  const { error } = await service.from("activities").insert({
    type,
    notes,
    lead_id: opportunityId,
    opportunity_id: opportunityId,
    user_id: userId,
    chatwoot_conversation_id: conversationId,
    chatwoot_message_id: messageId || null,
  });
  if (error) {
    await logError("chatwoot_activity", String(messageId || conversationId), error.message, opts);
    return { error: error.message };
  }
  return { ok: true };
}

function buildHeader(conversation: any, extra?: string): string {
  const status = conversation?.status || "open";
  const tab = extractTabulacao(conversation) || "—";
  const head = `Chatwoot #${conversation.id} · status: ${status} · tabulação: ${tab}`;
  return extra ? `${head}\n\n${extra}` : head;
}

async function handleConversationCreated(payload: any) {
  const conversation = payload;
  const ctx = await resolveContext(conversation);
  await upsertConversation(conversation, ctx);

  const userId = await fallbackUserId();
  if (!userId) return { skipped: true, reason: "no_admin_user" };

  await createActivity({
    type: "mensagem_enviada",
    notes: buildHeader(conversation, "Conversa criada"),
    conversationId: Number(conversation.id),
    opportunityId: ctx.opportunityId,
    userId,
  });
  await applyTagForEvent(ctx.opportunityId, "conversation_created");
  await bumpOpportunityInteraction(ctx.opportunityId);
  return { ok: true };
}

async function handleMessageCreated(payload: any) {
  const conversation = payload.conversation || payload;
  const message = payload.message_type !== undefined ? payload : payload.message;
  if (!conversation || !message) return { skipped: true, reason: "no_message" };

  const ctx = await resolveContext(conversation);
  await upsertConversation(conversation, ctx);

  const userId = await fallbackUserId();
  if (!userId) return { skipped: true, reason: "no_admin_user" };

  // message_type: 0 incoming (from contact), 1 outgoing (from agent), 2 activity, 3 template
  const mt = message.message_type;
  let activityType: "mensagem_enviada" | "resposta_recebida" = "mensagem_enviada";
  if (mt === 0 || mt === "incoming") activityType = "resposta_recebida";
  else if (mt === 1 || mt === "outgoing") activityType = "mensagem_enviada";
  else return { skipped: true, reason: "non_user_message" };

  const content = (message.content || message.text || "").toString().slice(0, 4000);
  const notes = buildHeader(conversation, content || "(sem conteúdo)");

  const result = await createActivity({
    type: activityType,
    notes,
    conversationId: Number(conversation.id),
    messageId: message.id ? Number(message.id) : null,
    opportunityId: ctx.opportunityId,
    userId,
  });

  // Tag "Mensagem respondida" only on incoming (cliente respondeu)
  if (activityType === "resposta_recebida") {
    await applyTagForEvent(ctx.opportunityId, "message_replied");
  }

  await bumpOpportunityInteraction(ctx.opportunityId);
  return result;
}

async function handleConversationUpdated(payload: any) {
  const conversation = payload;
  const ctx = await resolveContext(conversation);

  // Detect status / tabulação changes vs current row
  const { data: current } = await service
    .from("chatwoot_conversations")
    .select("status, tabulacao_atendimento")
    .eq("chatwoot_conversation_id", Number(conversation.id))
    .maybeSingle();

  const newStatus = conversation.status || "open";
  const newTab = extractTabulacao(conversation);
  const changed =
    !current ||
    current.status !== newStatus ||
    (current.tabulacao_atendimento || null) !== (newTab || null);

  await upsertConversation(conversation, ctx);

  if (changed && ctx.opportunityId) {
    const userId = await fallbackUserId();
    if (userId) {
      const parts: string[] = [];
      if (!current || current.status !== newStatus) {
        parts.push(`Status: ${current?.status || "—"} → ${newStatus}`);
      }
      if ((current?.tabulacao_atendimento || null) !== (newTab || null)) {
        parts.push(`Tabulação: ${current?.tabulacao_atendimento || "—"} → ${newTab || "—"}`);
      }
      await createActivity({
        type: "chatwoot_status_change",
        notes: buildHeader(conversation, parts.join("\n")),
        conversationId: Number(conversation.id),
        opportunityId: ctx.opportunityId,
        userId,
      });
    }
  }

  // Always apply tag based on which event came in
  if (payload.event === "conversation_status_changed") {
    await applyTagForEvent(ctx.opportunityId, "conversation_status_changed");
  } else {
    await applyTagForEvent(ctx.opportunityId, "conversation_updated");
  }

  await bumpOpportunityInteraction(ctx.opportunityId);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    const sig = req.headers.get("x-chatwoot-signature");
    const valid = await verifyHmac(rawBody, sig);
    if (!valid) {
      await logError("chatwoot_webhook", null, "Invalid HMAC signature", { sig });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await bumpLastEvent();

    const eventName: string = payload.event || payload.type || "unknown";
    let result: any = { skipped: true, reason: "unknown_event" };

    if (eventName === "conversation_created") {
      result = await handleConversationCreated(payload);
    } else if (eventName === "message_created" || eventName === "message_updated") {
      result = await handleMessageCreated(payload);
    } else if (
      eventName === "conversation_updated" ||
      eventName === "conversation_status_changed"
    ) {
      result = await handleConversationUpdated(payload);
    }

    return new Response(JSON.stringify({ ok: true, eventName, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    await logError("chatwoot_webhook", null, msg, {});
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
