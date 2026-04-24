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

async function resolveContext(conversation: any): Promise<ResolvedContext> {
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
  return { contactId, opportunityId, email, phone };
}

function extractTabulacao(conversation: any): string | null {
  const attrs = conversation?.custom_attributes || {};
  return (
    attrs.tabulacao_atendimento ||
    attrs.tabulacaoAtendimento ||
    attrs["tabulacao-atendimento"] ||
    null
  );
}

async function upsertConversation(
  conversation: any,
  ctx: ResolvedContext,
): Promise<void> {
  const convId = Number(conversation.id);
  if (!convId) return;
  const accountId = Number(conversation.account_id || conversation.inbox?.account_id || 0);
  const inboxId = conversation.inbox_id ? Number(conversation.inbox_id) : null;
  const status = conversation.status || "open";
  const tabulacao = extractTabulacao(conversation);
  const lastMsgAt = conversation.last_activity_at
    ? new Date(Number(conversation.last_activity_at) * 1000).toISOString()
    : new Date().toISOString();

  const { error } = await service.from("chatwoot_conversations").upsert(
    {
      chatwoot_conversation_id: convId,
      chatwoot_account_id: accountId,
      chatwoot_inbox_id: inboxId,
      status,
      tabulacao_atendimento: tabulacao,
      contact_id: ctx.contactId,
      opportunity_id: ctx.opportunityId,
      contact_email: ctx.email,
      contact_phone: ctx.phone,
      last_message_at: lastMsgAt,
    },
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
