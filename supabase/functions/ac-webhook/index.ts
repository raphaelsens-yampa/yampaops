import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ac-signature",
};

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const AC_WEBHOOK_SECRET = Deno.env.get("AC_WEBHOOK_SECRET") || "";
const AC_API_URL = (Deno.env.get("AC_API_URL") || "").replace(/\/$/, "");
const AC_API_KEY = Deno.env.get("AC_API_KEY") || "";

async function logError(entity_type: string, ac_id: string | null, error_message: string, payload: any) {
  try {
    await service.from("integration_sync_errors").insert({ entity_type, ac_id, error_message, payload });
  } catch (_) { /* ignore */ }
}

async function verifyHmac(rawBody: string, sigHeader: string | null): Promise<boolean> {
  // ActiveCampaign default webhooks DON'T send signature headers — they rely on URL secrecy.
  // If no signature header is present, accept the webhook (URL is the secret).
  // If a signature IS present, validate it against AC_WEBHOOK_SECRET.
  if (!sigHeader) return true;
  if (!AC_WEBHOOK_SECRET) return true;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(AC_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.toLowerCase() === sigHeader.toLowerCase().replace(/^sha256=/, "");
}

async function getPipelineSelection(acPipelineId: string) {
  const { data } = await service
    .from("ac_pipeline_selection")
    .select("is_selected, local_pipeline_id, ac_pipeline_title")
    .eq("ac_pipeline_id", acPipelineId)
    .maybeSingle();
  return data;
}

async function ensurePipeline(acPipelineId: string): Promise<string | null> {
  const sel = await getPipelineSelection(acPipelineId);
  if (!sel || !sel.is_selected) return null;
  if (sel.local_pipeline_id) return sel.local_pipeline_id;
  // Create on the fly
  const { data, error } = await service.from("pipelines").upsert({
    ac_id: acPipelineId,
    name: sel.ac_pipeline_title,
  }, { onConflict: "ac_id" }).select("id").single();
  if (error) {
    await logError("pipeline", acPipelineId, error.message, sel);
    return null;
  }
  await service.from("ac_pipeline_selection").update({ local_pipeline_id: data.id }).eq("ac_pipeline_id", acPipelineId);
  return data.id;
}

async function findUserByEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data } = await service.from("profiles").select("user_id").ilike("email", email).maybeSingle();
  return data?.user_id ?? null;
}

async function fetchAcDeal(dealId: string): Promise<any | null> {
  if (!AC_API_URL || !AC_API_KEY) return null;
  try {
    const res = await fetch(`${AC_API_URL}/api/3/deals/${dealId}`, { headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function processDeal(payload: any) {
  // payload.deal can be flat fields from AC webhook
  const deal = payload.deal || payload;
  const acDealId = String(deal.id);
  const acPipelineId = String(deal.pipeline || deal.group || "");

  if (!acPipelineId) {
    await logError("deal", acDealId, "No pipeline in payload", payload);
    return { skipped: true, reason: "no_pipeline" };
  }

  const localPipelineId = await ensurePipeline(acPipelineId);
  if (!localPipelineId) return { skipped: true, reason: "pipeline_not_selected" };

  // Fetch stage slug
  let stageSlug = "novo_lead";
  if (deal.stage) {
    const { data: stage } = await service.from("pipeline_stages").select("slug").eq("ac_id", String(deal.stage)).maybeSingle();
    if (stage) stageSlug = stage.slug;
  }

  // Sync contact if present — lookup by ac_id OR email to avoid duplicates
  let localContactId: string | null = null;
  let dealPhone: string | null = deal.contact_phone || deal.contactPhone || null;
  if (deal.contact) {
    const { data: existing } = await service.from("contacts").select("id, phone").eq("ac_id", String(deal.contact)).maybeSingle();
    if (existing) {
      localContactId = existing.id;
      if (!dealPhone) dealPhone = existing.phone || null;
    } else if (deal.contact_email || deal.contactEmail) {
      const email = String(deal.contact_email || deal.contactEmail).toLowerCase().trim();
      const { data: byEmail } = await service.from("contacts").select("id, phone").ilike("email", email).maybeSingle();
      if (byEmail) {
        localContactId = byEmail.id;
        if (!dealPhone) dealPhone = byEmail.phone || null;
      }
    }
  }

  const consultantId = await findUserByEmail(deal.owner_email || deal.ownerEmail);

  const { error } = await service.from("opportunities").upsert({
    ac_id: acDealId,
    name: deal.title || `Deal ${acDealId}`,
    title: deal.title || null,
    contact_id: localContactId,
    phone: dealPhone,
    consultant_id: consultantId,
    pipeline_id: localPipelineId,
    stage: stageSlug,
    estimated_mrr: deal.value ? Number(deal.value) / 100 : 0,
    origin: "freetrial",
  }, { onConflict: "ac_id" });

  if (error) {
    await logError("deal", acDealId, error.message, deal);
    return { error: error.message };
  }
  return { ok: true };
}

async function processContact(payload: any) {
  const contact = payload.contact || payload;
  const acContactId = String(contact.id);
  const email = contact.email ? String(contact.email).toLowerCase().trim() : null;
  const fullName = [contact.first_name || contact.firstName, contact.last_name || contact.lastName].filter(Boolean).join(" ") || email || `Contact ${acContactId}`;

  // Lookup by ac_id first, then by email — avoid creating duplicates
  let { data: existing } = await service.from("contacts").select("id, ac_id").eq("ac_id", acContactId).maybeSingle();
  if (!existing && email) {
    const { data: byEmail } = await service.from("contacts").select("id, ac_id").ilike("email", email).maybeSingle();
    if (byEmail) existing = byEmail;
  }

  if (existing) {
    const { error } = await service.from("contacts").update({
      ac_id: acContactId,
      name: fullName,
      email,
      phone: contact.phone || null,
    }).eq("id", existing.id);
    if (error) {
      await logError("contact", acContactId, error.message, contact);
      return { error: error.message };
    }
    return { ok: true, updated: existing.id };
  }

  // Create new only when no match by ac_id or email
  const { error } = await service.from("contacts").insert({
    ac_id: acContactId,
    name: fullName,
    email,
    phone: contact.phone || null,
  });
  if (error) {
    await logError("contact", acContactId, error.message, contact);
    return { error: error.message };
  }
  return { ok: true, created: true };
}

async function processNote(payload: any) {
  const note = payload.note || payload.dealNote || payload;
  const acDealId = String(note.deal || note.relid || "");
  if (!acDealId) return { skipped: true };

  const { data: opp } = await service.from("opportunities").select("id, consultant_id").eq("ac_id", acDealId).maybeSingle();
  if (!opp) return { skipped: true, reason: "deal_not_imported" };

  const userId = opp.consultant_id || (await service.from("profiles").select("user_id").limit(1).single()).data?.user_id;
  if (!userId) return { skipped: true, reason: "no_user" };

  const { error } = await service.from("activities").upsert({
    ac_id: `note-${note.id}`,
    lead_id: opp.id,
    opportunity_id: opp.id,
    user_id: userId,
    type: "mensagem_enviada",
    notes: note.note || note.text || "",
  }, { onConflict: "ac_id" });

  if (error) {
    await logError("note", String(note.id), error.message, note);
    return { error: error.message };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const rawBody = await req.text();
    const sig = req.headers.get("x-ac-signature") || req.headers.get("X-AC-Signature");

    const valid = await verifyHmac(rawBody, sig);
    if (!valid) {
      await logError("webhook", null, "Invalid HMAC signature", { sig });
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // AC webhooks can also be form-encoded
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    }

    const eventType: string = payload.type || payload.event || "unknown";

    let result: any = { skipped: true, reason: "unknown_event" };

    if (eventType.startsWith("deal_")) {
      result = await processDeal(payload);
    } else if (eventType.startsWith("contact_")) {
      result = await processContact(payload);
    } else if (eventType.includes("note") || eventType.includes("task")) {
      result = await processNote(payload);
    }

    return new Response(JSON.stringify({ ok: true, eventType, result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    await logError("webhook", null, msg, {});
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
