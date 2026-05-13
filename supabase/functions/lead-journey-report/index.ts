import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  pipeline_id: z.string().uuid(),
  start: z.string(),
  end: z.string(),
  consultant_ids: z.array(z.string().uuid()).optional(),
  origins: z.array(z.string()).optional(),
});

type Bucket = "<24h" | "1-3d" | "4-7d" | ">7d" | "Sem contato";
const BUCKETS: Bucket[] = ["<24h", "1-3d", "4-7d", ">7d", "Sem contato"];

function bucketOf(hours: number | null): Bucket {
  if (hours === null) return "Sem contato";
  if (hours < 24) return "<24h";
  if (hours < 24 * 4) return "1-3d";
  if (hours <= 24 * 7) return "4-7d";
  return ">7d";
}

function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D+/g, "");
  return d.length >= 8 ? d : null;
}

function normEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return t || null;
}

function dayKey(d: string | Date | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Role check (admin or tatico)
    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", userRes.user.id);
    const allowed = (roles || []).some((r: any) => r.role === "admin" || r.role === "tatico");
    if (!allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { pipeline_id, start, end, consultant_ids, origins } = parsed.data;

    const admin = createClient(url, service);

    // 1) Opportunities (leads AC) in period
    let oppQ = admin
      .from("opportunities")
      .select("id, name, stage, contact_id, consultant_id, origin, sub_origin, opportunity_created_at, estimated_mrr")
      .eq("pipeline_id", pipeline_id)
      .gte("opportunity_created_at", start)
      .lte("opportunity_created_at", end)
      .limit(20000);

    if (consultant_ids?.length) oppQ = oppQ.in("consultant_id", consultant_ids);
    if (origins?.length) oppQ = oppQ.in("origin", origins as any);

    const { data: opps, error: oppErr } = await oppQ;
    if (oppErr) throw oppErr;

    const contactIds = Array.from(new Set((opps || []).map((o: any) => o.contact_id).filter(Boolean)));
    const oppIds = (opps || []).map((o: any) => o.id);

    // 2) Contacts → email/phone
    const contactsMap = new Map<string, { email: string | null; phone: string | null; name: string | null }>();
    if (contactIds.length) {
      const { data: contacts } = await admin
        .from("contacts")
        .select("id, email, phone, name")
        .in("id", contactIds);
      for (const c of contacts || []) {
        contactsMap.set(c.id, { email: normEmail(c.email), phone: normPhone(c.phone), name: c.name });
      }
    }

    const emails = Array.from(new Set([...contactsMap.values()].map((c) => c.email).filter(Boolean) as string[]));
    const phones = Array.from(new Set([...contactsMap.values()].map((c) => c.phone).filter(Boolean) as string[]));

    // 3) Consultant names
    const consultantIds = Array.from(new Set((opps || []).map((o: any) => o.consultant_id).filter(Boolean)));
    const consultantsMap = new Map<string, string>();
    if (consultantIds.length) {
      const { data: profs } = await admin.from("profiles").select("user_id, full_name").in("user_id", consultantIds);
      for (const p of profs || []) consultantsMap.set(p.user_id, p.full_name || "—");
    }

    // 4) Chatwoot conversations matching email or phone
    type CwInfo = { ts: string; convs: Array<{ id: number; contact_email: string | null; contact_phone: string | null; first_contact_message_at: string | null; opened_at: string | null }> };
    const firstContactByEmail = new Map<string, CwInfo>();
    const firstContactByPhone = new Map<string, CwInfo>();

    async function fetchCw(field: "contact_email" | "contact_phone", values: string[]) {
      if (!values.length) return [] as any[];
      const out: any[] = [];
      const CHUNK = 200;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        const { data } = await admin
          .from("chatwoot_conversations")
          .select(`chatwoot_conversation_id, contact_email, contact_phone, first_contact_message_at, opened_at`)
          .in(field, chunk)
          .limit(20000);
        if (data) out.push(...data);
      }
      return out;
    }

    const cwByEmail = await fetchCw("contact_email", emails);
    for (const r of cwByEmail) {
      const k = normEmail(r.contact_email);
      const ts = r.first_contact_message_at || r.opened_at;
      if (!k || !ts) continue;
      const conv = { id: r.chatwoot_conversation_id, contact_email: r.contact_email, contact_phone: r.contact_phone, first_contact_message_at: r.first_contact_message_at, opened_at: r.opened_at };
      const cur = firstContactByEmail.get(k);
      if (!cur) {
        firstContactByEmail.set(k, { ts, convs: [conv] });
      } else {
        cur.convs.push(conv);
        if (new Date(ts) < new Date(cur.ts)) cur.ts = ts;
      }
    }

    // For phone we need to compare normalized; fetch by raw and normalize client side
    const phoneSet = new Set(phones);
    if (phones.length) {
      const { data: cwAll } = await admin
        .from("chatwoot_conversations")
        .select("chatwoot_conversation_id, contact_email, contact_phone, first_contact_message_at, opened_at")
        .not("contact_phone", "is", null)
        .limit(50000);
      for (const r of cwAll || []) {
        const np = normPhone(r.contact_phone);
        if (!np || !phoneSet.has(np)) continue;
        const ts = r.first_contact_message_at || r.opened_at;
        if (!ts) continue;
        const conv = { id: r.chatwoot_conversation_id, contact_email: r.contact_email, contact_phone: r.contact_phone, first_contact_message_at: r.first_contact_message_at, opened_at: r.opened_at };
        const cur = firstContactByPhone.get(np);
        if (!cur) {
          firstContactByPhone.set(np, { ts, convs: [conv] });
        } else {
          cur.convs.push(conv);
          if (new Date(ts) < new Date(cur.ts)) cur.ts = ts;
        }
      }
    }

    // 5) Stripe conversions
    const stripeByOpp = new Map<string, { mrr: number; converted_at: string }>();
    const stripeByEmail = new Map<string, { mrr: number; converted_at: string }>();
    if (oppIds.length) {
      const { data: sc } = await admin
        .from("stripe_conversions")
        .select("matched_opportunity_id, customer_email, mrr, converted_at")
        .in("matched_opportunity_id", oppIds);
      for (const r of sc || []) {
        if (r.matched_opportunity_id) {
          const cur = stripeByOpp.get(r.matched_opportunity_id);
          if (!cur || new Date(r.converted_at) < new Date(cur.converted_at)) {
            stripeByOpp.set(r.matched_opportunity_id, { mrr: Number(r.mrr || 0), converted_at: r.converted_at });
          }
        }
      }
    }
    if (emails.length) {
      const CHUNK = 200;
      for (let i = 0; i < emails.length; i += CHUNK) {
        const chunk = emails.slice(i, i + CHUNK);
        const { data: sc } = await admin
          .from("stripe_conversions")
          .select("customer_email, mrr, converted_at")
          .in("customer_email", chunk);
        for (const r of sc || []) {
          const e = normEmail(r.customer_email);
          if (!e) continue;
          const cur = stripeByEmail.get(e);
          if (!cur || new Date(r.converted_at) < new Date(cur.converted_at)) {
            stripeByEmail.set(e, { mrr: Number(r.mrr || 0), converted_at: r.converted_at });
          }
        }
      }
    }

    // 6) Build rows — priority: phone first, then email fallback
    let matchedByPhone = 0;
    let matchedByEmail = 0;
    const rows = (opps || []).map((o: any) => {
      const c = o.contact_id ? contactsMap.get(o.contact_id) : null;
      const email = c?.email || null;
      const phone = c?.phone || null;
      let firstContact: string | null = null;
      let matchMethod: "phone" | "email" | null = null;
      let matchedConvs: Array<{ id: number; contact_email: string | null; contact_phone: string | null; first_contact_message_at: string | null; opened_at: string | null }> = [];
      let matchedKey: string | null = null;

      const phoneHit = phone ? firstContactByPhone.get(phone) : null;
      const emailHit = email ? firstContactByEmail.get(email) : null;

      if (phoneHit) {
        firstContact = phoneHit.ts;
        matchMethod = "phone";
        matchedByPhone += 1;
        matchedConvs = phoneHit.convs;
        matchedKey = phone;
      } else if (emailHit) {
        firstContact = emailHit.ts;
        matchMethod = "email";
        matchedByEmail += 1;
        matchedConvs = emailHit.convs;
        matchedKey = email;
      }

      const created = new Date(o.opportunity_created_at);
      const hoursToContact = firstContact ? Math.max(0, (new Date(firstContact).getTime() - created.getTime()) / 3600000) : null;
      const bucket = bucketOf(hoursToContact);

      const stripe = stripeByOpp.get(o.id) || (email ? stripeByEmail.get(email) : null);

      let matchReason: string;
      if (matchMethod === "phone") matchReason = `Telefone normalizado "${matchedKey}" bateu com ${matchedConvs.length} conversa(s) Chatwoot`;
      else if (matchMethod === "email") matchReason = `Email "${matchedKey}" bateu com ${matchedConvs.length} conversa(s) Chatwoot (fallback, telefone não encontrou)`;
      else if (!phone && !email) matchReason = "Lead sem telefone e sem email no contato";
      else if (!phone) matchReason = `Sem telefone. Email "${email}" não encontrou nenhuma conversa`;
      else if (!email) matchReason = `Sem email. Telefone "${phone}" não encontrou nenhuma conversa`;
      else matchReason = `Telefone "${phone}" e email "${email}" não encontraram conversa`;

      return {
        id: o.id,
        name: o.name,
        contact_name: c?.name || null,
        email,
        phone,
        consultant_id: o.consultant_id,
        consultant_name: o.consultant_id ? consultantsMap.get(o.consultant_id) || "—" : null,
        origin: o.origin,
        sub_origin: o.sub_origin,
        stage: o.stage,
        opportunity_created_at: o.opportunity_created_at,
        first_contact_at: firstContact,
        hours_to_contact: hoursToContact,
        bucket,
        match_method: matchMethod,
        match_reason: matchReason,
        matched_conversation_ids: matchedConvs.map((cv) => cv.id),
        matched_conversations: matchedConvs.slice(0, 10),
        is_paying: !!stripe,
        mrr: stripe?.mrr || 0,
        converted_at: stripe?.converted_at || null,
      };
    });

    console.log(`lead-journey-report: leads=${rows.length} matched_by_phone=${matchedByPhone} matched_by_email=${matchedByEmail} cw_email_keys=${firstContactByEmail.size} cw_phone_keys=${firstContactByPhone.size}`);

    // 7) Aggregates
    const totalLeads = rows.length;
    const contacted = rows.filter((r) => r.bucket !== "Sem contato").length;
    const inSla = rows.filter((r) => r.bucket === "<24h" || r.bucket === "1-3d").length;
    const paying = rows.filter((r) => r.is_paying).length;
    const mrrTotal = rows.reduce((s, r) => s + (r.mrr || 0), 0);

    const slaBuckets = BUCKETS.map((b) => ({ bucket: b, count: rows.filter((r) => r.bucket === b).length }));

    // Timeseries by day
    const tsMap = new Map<string, { date: string; leads: number; contacted: number; paying: number }>();
    for (const r of rows) {
      const dk = dayKey(r.opportunity_created_at);
      if (!dk) continue;
      const cur = tsMap.get(dk) || { date: dk, leads: 0, contacted: 0, paying: 0 };
      cur.leads += 1;
      if (r.bucket !== "Sem contato") cur.contacted += 1;
      if (r.is_paying) cur.paying += 1;
      tsMap.set(dk, cur);
    }
    const timeseries = Array.from(tsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    function groupBy(keyFn: (r: any) => string | null, labelFn: (r: any) => string) {
      const m = new Map<string, { key: string; label: string; leads: number; contacted: number; in_sla: number; paying: number; mrr: number }>();
      for (const r of rows) {
        const k = keyFn(r);
        if (!k) continue;
        const cur = m.get(k) || { key: k, label: labelFn(r), leads: 0, contacted: 0, in_sla: 0, paying: 0, mrr: 0 };
        cur.leads += 1;
        if (r.bucket !== "Sem contato") cur.contacted += 1;
        if (r.bucket === "<24h" || r.bucket === "1-3d") cur.in_sla += 1;
        if (r.is_paying) {
          cur.paying += 1;
          cur.mrr += r.mrr || 0;
        }
        m.set(k, cur);
      }
      return Array.from(m.values()).sort((a, b) => b.leads - a.leads);
    }

    const byConsultant = groupBy((r) => r.consultant_id, (r) => r.consultant_name || "—");
    const byOrigin = groupBy((r) => r.origin || "—", (r) => r.origin || "—");

    const payload = {
      kpis: {
        leads: totalLeads,
        contacted,
        contacted_pct: totalLeads ? (contacted / totalLeads) * 100 : 0,
        in_sla: inSla,
        in_sla_pct: totalLeads ? (inSla / totalLeads) * 100 : 0,
        paying,
        paying_pct: totalLeads ? (paying / totalLeads) * 100 : 0,
        mrr_total: mrrTotal,
      },
      sla_buckets: slaBuckets,
      timeseries,
      by_consultant: byConsultant,
      by_origin: byOrigin,
      match_stats: {
        matched_by_phone: matchedByPhone,
        matched_by_email: matchedByEmail,
        cw_phone_keys: firstContactByPhone.size,
        cw_email_keys: firstContactByEmail.size,
        contacts_with_phone: phones.length,
        contacts_with_email: emails.length,
      },
      rows,
    };

    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("lead-journey-report error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
