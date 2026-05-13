// Backfill paginado dos Contatos do Chatwoot para a tabela public.chatwoot_contacts.
// Body: { page_start?: number, max_pages?: number, page_size?: number }
// Pagina /api/v1/accounts/{id}/contacts?page=N&include_contact_inboxes=true
// Para cada contato: extrai e normaliza emails/phones (incluindo secundários),
// faz upsert e tenta casar com public.contacts (email -> email_secundario -> phone -> identifier).

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
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.length > 11 ? digits.slice(-11) : digits;
}

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  const n = Number(v);
  if (!isNaN(n) && n > 0) return new Date(n * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractAdditional(contact: any): { emails: string[]; phones: string[]; inboxIds: number[] } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const inboxIds = new Set<number>();

  // contact_inboxes pode trazer source_id (telefone para WA, email para email-channel)
  const cis = contact?.contact_inboxes || [];
  for (const ci of cis) {
    if (ci?.inbox?.id) inboxIds.add(Number(ci.inbox.id));
    const sid = ci?.source_id;
    if (!sid) continue;
    const s = String(sid);
    if (s.includes("@")) emails.add(s.toLowerCase());
    else {
      const p = normPhone(s);
      if (p) phones.add(p);
    }
  }

  // additional_attributes pode ter listas custom
  const aa = contact?.additional_attributes || {};
  const possibleEmails = [aa.email_2, aa.secondary_email, aa.work_email, ...(aa.emails || [])].filter(Boolean);
  const possiblePhones = [aa.phone_2, aa.secondary_phone, aa.whatsapp, ...(aa.phones || [])].filter(Boolean);
  for (const e of possibleEmails) emails.add(String(e).toLowerCase());
  for (const p of possiblePhones) {
    const n = normPhone(p);
    if (n) phones.add(n);
  }

  // remove o principal das listas secundárias
  const primaryEmail = (contact?.email || "").toLowerCase();
  const primaryPhone = normPhone(contact?.phone_number);
  if (primaryEmail) emails.delete(primaryEmail);
  if (primaryPhone) phones.delete(primaryPhone);

  return {
    emails: Array.from(emails),
    phones: Array.from(phones),
    inboxIds: Array.from(inboxIds),
  };
}

type MatchResult = { contactId: string | null; method: string; notes?: string };

async function findInternalContact(p: {
  email: string | null;
  phone: string | null;
  additionalEmails: string[];
  additionalPhones: string[];
  identifier: string | null;
}): Promise<MatchResult> {
  // 1) email primário
  if (p.email) {
    const { data } = await service.from("contacts").select("id").ilike("email", p.email).maybeSingle();
    if (data?.id) return { contactId: data.id, method: "email" };
  }
  // 2) emails secundários
  for (const e of p.additionalEmails) {
    const { data } = await service.from("contacts").select("id").ilike("email", e).maybeSingle();
    if (data?.id) return { contactId: data.id, method: "email_secundario", notes: e };
  }
  // 3) telefone (busca por sufixo de 8 dígitos para ser tolerante a DDI/DDD)
  const tryPhones = [p.phone, ...p.additionalPhones].filter(Boolean) as string[];
  for (const ph of tryPhones) {
    const suffix = ph.slice(-8);
    const { data } = await service
      .from("contacts")
      .select("id, phone")
      .ilike("phone", `%${suffix}%`)
      .limit(5);
    const exact = (data || []).find((c: any) => normPhone(c.phone) === ph);
    if (exact?.id) return { contactId: exact.id, method: "phone", notes: ph };
  }
  // 4) identifier
  if (p.identifier) {
    const { data } = await service.from("contacts").select("id").eq("ac_id", p.identifier).maybeSingle();
    if (data?.id) return { contactId: data.id, method: "identifier", notes: p.identifier };
  }
  return { contactId: null, method: "none" };
}

async function processContact(c: any, accountId: number) {
  const cwId = Number(c.id);
  if (!cwId) return;

  const email = (c.email || "").toLowerCase().trim() || null;
  const phoneE164 = c.phone_number || null;
  const phoneDigits = normPhone(phoneE164);
  const { emails: addlEmails, phones: addlPhones, inboxIds } = extractAdditional(c);

  const identifier = c.identifier ? String(c.identifier) : null;

  const match = await findInternalContact({
    email,
    phone: phoneDigits,
    additionalEmails: addlEmails,
    additionalPhones: addlPhones,
    identifier,
  });

  await service.from("chatwoot_contacts").upsert({
    chatwoot_contact_id: cwId,
    chatwoot_account_id: accountId,
    identifier,
    name: c.name || null,
    email,
    phone_e164: phoneE164,
    phone_digits: phoneDigits,
    additional_emails: addlEmails,
    additional_phones: addlPhones,
    company_name: c.additional_attributes?.company_name || c.company_name || null,
    city: c.additional_attributes?.city || null,
    country_code: c.additional_attributes?.country_code || null,
    custom_attributes: c.custom_attributes || {},
    additional_attributes: c.additional_attributes || {},
    inbox_ids: inboxIds,
    conversations_count: c.conversations_count || 0,
    last_activity_at: tsToIso(c.last_activity_at),
    created_at_chatwoot: tsToIso(c.created_at),
    raw: c,
    matched_contact_id: match.contactId,
    match_method: match.method,
    matched_at: match.contactId ? new Date().toISOString() : null,
    synced_at: new Date().toISOString(),
  }, { onConflict: "chatwoot_contact_id" });

  await service.from("chatwoot_contact_match_log").insert({
    chatwoot_contact_id: cwId,
    method: match.method,
    matched_contact_id: match.contactId,
    notes: match.notes || null,
  });
}

async function listContacts(baseUrl: string, accountId: number, page: number, pageSize: number) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/contacts?page=${page}&include_contact_inboxes=true&sort=-last_activity_at`;
  const res = await fetch(url, { headers: { api_access_token: CHATWOOT_API_TOKEN } });
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
    const startPage: number = Number(body.page_start || 1);
    const maxPages: number = Number(body.max_pages || 4);
    const pageSize: number = Number(body.page_size || 25);
    const timeBudgetMs: number = Number(body.time_budget_ms || 120000);
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

    let page = startPage;
    const endPage = startPage + maxPages - 1;
    let totalProcessed = 0;
    let totalCount = 0;
    const errors: string[] = [];
    let lastNonEmpty = startPage - 1;

    let timedOut = false;
    while (page <= endPage) {
      if (Date.now() - startedAt > timeBudgetMs) { timedOut = true; break; }
      let resp: { items: any[]; meta: any };
      try {
        resp = await listContacts(baseUrl, accountId, page, pageSize);
      } catch (e: any) {
        errors.push(`page ${page}: ${e.message}`);
        break;
      }
      const items = resp.items || [];
      totalCount = resp.meta?.count || resp.meta?.all_count || totalCount;
      if (!items.length) break;
      lastNonEmpty = page;

      const BATCH = 5;
      for (let i = 0; i < items.length; i += BATCH) {
        const slice = items.slice(i, i + BATCH);
        const results = await Promise.allSettled(slice.map((it) => processContact(it, accountId)));
        results.forEach((r, idx) => {
          if (r.status === "fulfilled") totalProcessed++;
          else errors.push(`contact ${slice[idx]?.id}: ${r.reason?.message || r.reason}`);
        });
      }

      page++;
    }

    const done = !timedOut && (totalCount > 0 ? (lastNonEmpty * 25) >= totalCount : false);
    const nextPage = lastNonEmpty + 1;

    return new Response(JSON.stringify({
      ok: true,
      page_start: startPage,
      pages_processed: lastNonEmpty - startPage + 1,
      processed: totalProcessed,
      total_in_chatwoot: totalCount,
      next_page: done ? null : nextPage,
      done,
      errors: errors.slice(0, 20),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
