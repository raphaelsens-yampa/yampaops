import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const RowSchema = z.object({
  row_index: z.number().int().nonnegative(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  campaign: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  extra: z.record(z.any()).optional(),
});

const ProcessSchema = z.object({
  action: z.literal("process"),
  name: z.string().min(1).max(200),
  source_file_name: z.string().optional(),
  column_mapping: z.record(z.any()).default({}),
  rows: z.array(RowSchema).min(1).max(10000),
});

const GetSchema = z.object({
  action: z.literal("get"),
  import_id: z.string().uuid(),
});

const ListSchema = z.object({ action: z.literal("list") });
const DeleteSchema = z.object({ action: z.literal("delete"), import_id: z.string().uuid() });

const BodySchema = z.union([ProcessSchema, GetSchema, ListSchema, DeleteSchema]);

function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = String(p).replace(/\D+/g, "");
  return d.length >= 8 ? d : null;
}
function normEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = String(e).trim().toLowerCase();
  return t || null;
}
function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // try ISO
  const iso = new Date(t);
  if (!isNaN(iso.getTime())) return iso.toISOString();
  // try dd/mm/yyyy [hh:mm[:ss]]
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
    const yyyy = y.length === 2 ? Number("20" + y) : Number(y);
    const dt = new Date(yyyy, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  return null;
}
function bucketOf(hours: number | null): string {
  if (hours === null) return "Sem contato";
  if (hours < 0) return "<24h"; // contato antes do lead
  if (hours < 24) return "<24h";
  if (hours < 24 * 4) return "1-3d";
  if (hours <= 24 * 7) return "4-7d";
  return ">7d";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", userRes.user.id);
    const allowed = (roles || []).some((r: any) => r.role === "admin" || r.role === "tatico");
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

    const admin = createClient(url, service);
    const body = parsed.data;

    if (body.action === "list") {
      const { data, error } = await admin
        .from("lead_imports")
        .select("id, name, source_file_name, total_rows, matched_chatwoot, matched_paying, status, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json({ imports: data || [] });
    }

    if (body.action === "delete") {
      const { error } = await admin.from("lead_imports").delete().eq("id", body.import_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "get") {
      return json(await buildReport(admin, body.import_id));
    }

    // ============ PROCESS ============
    const { name, source_file_name, column_mapping, rows } = body;

    // Create import header
    const { data: imp, error: impErr } = await admin
      .from("lead_imports")
      .insert({
        name,
        source_file_name,
        column_mapping,
        created_by: userRes.user.id,
        total_rows: rows.length,
        status: "processing",
      })
      .select()
      .single();
    if (impErr) throw impErr;

    try {
      // Normalize input rows
      const norm = rows.map((r) => ({
        row_index: r.row_index,
        email: normEmail(r.email),
        phone: normPhone(r.phone),
        phone_raw: r.phone || null,
        name: r.name || null,
        origin: r.origin || null,
        campaign: r.campaign || null,
        created_at: parseDate(r.created_at),
        extra: r.extra || {},
      }));

      const emails = Array.from(new Set(norm.map((r) => r.email).filter(Boolean) as string[]));
      const phones = Array.from(new Set(norm.map((r) => r.phone).filter(Boolean) as string[]));

      // ------ Fetch Chatwoot conversations matching email ------
      type Conv = {
        chatwoot_conversation_id: number;
        contact_email: string | null;
        contact_phone: string | null;
        first_contact_message_at: string | null;
        opened_at: string | null;
        last_message_at: string | null;
        assignee_name: string | null;
        assignee_email: string | null;
        status: string | null;
        labels: string[] | null;
        tabulacao_atendimento: string | null;
      };

      const cwByEmail = new Map<string, Conv[]>();
      const cwByPhone = new Map<string, Conv[]>();

      const cwSelect =
        "chatwoot_conversation_id, contact_email, contact_phone, first_contact_message_at, opened_at, last_message_at, assignee_name, assignee_email, status, labels, tabulacao_atendimento, chatwoot_contact_id";

      // ---- Enrich via chatwoot_contacts (primary + additional emails/phones) ----
      // Build maps lead-key -> cw_contact_ids
      const cwContactIdsByEmail = new Map<string, Set<number>>();
      const cwContactIdsByPhone = new Map<string, Set<number>>();
      const allCwContactIds = new Set<number>();
      {
        const emailSet = new Set(emails);
        const phoneSet = new Set(phones);
        const { data: cwContacts } = await admin
          .from("chatwoot_contacts")
          .select("chatwoot_contact_id, email, phone_digits, additional_emails, additional_phones")
          .limit(50000);
        for (const c of cwContacts || []) {
          const cid = Number((c as any).chatwoot_contact_id);
          const allEmails = [(c as any).email, ...((c as any).additional_emails || [])].filter(Boolean) as string[];
          const allPhones = [(c as any).phone_digits, ...((c as any).additional_phones || [])].filter(Boolean) as string[];
          for (const e of allEmails) {
            const k = String(e).toLowerCase();
            if (!emailSet.has(k)) continue;
            const s = cwContactIdsByEmail.get(k) || new Set<number>();
            s.add(cid); cwContactIdsByEmail.set(k, s);
            allCwContactIds.add(cid);
          }
          for (const p of allPhones) {
            if (!phoneSet.has(p)) continue;
            const s = cwContactIdsByPhone.get(p) || new Set<number>();
            s.add(cid); cwContactIdsByPhone.set(p, s);
            allCwContactIds.add(cid);
          }
        }
      }

      // Fetch conversations linked via chatwoot_contact_id
      const cwConvByContactId = new Map<number, Conv[]>();
      if (allCwContactIds.size) {
        const ids = Array.from(allCwContactIds);
        const CHUNK_ID = 500;
        for (let i = 0; i < ids.length; i += CHUNK_ID) {
          const chunk = ids.slice(i, i + CHUNK_ID);
          const { data } = await admin
            .from("chatwoot_conversations")
            .select(cwSelect)
            .in("chatwoot_contact_id", chunk)
            .limit(50000);
          for (const r of (data || []) as any as Conv[]) {
            const cid = Number((r as any).chatwoot_contact_id);
            if (!cid) continue;
            const arr = cwConvByContactId.get(cid) || [];
            arr.push(r); cwConvByContactId.set(cid, arr);
          }
        }
      }
      // Hydrate cwByEmail / cwByPhone from contacts
      for (const [k, ids] of cwContactIdsByEmail) {
        const arr = cwByEmail.get(k) || [];
        for (const id of ids) arr.push(...(cwConvByContactId.get(id) || []));
        if (arr.length) cwByEmail.set(k, arr);
      }
      for (const [k, ids] of cwContactIdsByPhone) {
        const arr = cwByPhone.get(k) || [];
        for (const id of ids) arr.push(...(cwConvByContactId.get(id) || []));
        if (arr.length) cwByPhone.set(k, arr);
      }

      // ---- Fallback: legacy match via inline contact_email / contact_phone in conversations ----
      // by email (chunked .in)
      const CHUNK = 200;
      for (let i = 0; i < emails.length; i += CHUNK) {
        const chunk = emails.slice(i, i + CHUNK);
        const { data } = await admin
          .from("chatwoot_conversations")
          .select(cwSelect)
          .in("contact_email", chunk)
          .limit(20000);
        for (const r of (data || []) as any as Conv[]) {
          const k = normEmail(r.contact_email);
          if (!k) continue;
          const arr = cwByEmail.get(k) || [];
          arr.push(r);
          cwByEmail.set(k, arr);
        }
      }

      // by phone (fetch all with phone not null and filter normalized)
      if (phones.length) {
        const phoneSet = new Set(phones);
        const { data } = await admin
          .from("chatwoot_conversations")
          .select(cwSelect)
          .not("contact_phone", "is", null)
          .limit(50000);
        for (const r of (data || []) as any as Conv[]) {
          const np = normPhone(r.contact_phone);
          if (!np || !phoneSet.has(np)) continue;
          const arr = cwByPhone.get(np) || [];
          arr.push(r);
          cwByPhone.set(np, arr);
        }
      }

      // Deduplicate conversations per key
      for (const [k, arr] of cwByEmail) {
        const seen = new Set<number>();
        cwByEmail.set(k, arr.filter((c) => {
          const id = c.chatwoot_conversation_id;
          if (seen.has(id)) return false;
          seen.add(id); return true;
        }));
      }
      for (const [k, arr] of cwByPhone) {
        const seen = new Set<number>();
        cwByPhone.set(k, arr.filter((c) => {
          const id = c.chatwoot_conversation_id;
          if (seen.has(id)) return false;
          seen.add(id); return true;
        }));
      }

      // ------ Stripe by email ------
      const stripeByEmail = new Map<string, { mrr: number; converted_at: string; plan: string | null }>();
      for (let i = 0; i < emails.length; i += CHUNK) {
        const chunk = emails.slice(i, i + CHUNK);
        const { data } = await admin
          .from("stripe_conversions")
          .select("customer_email, mrr, converted_at, plan_name")
          .in("customer_email", chunk);
        for (const r of data || []) {
          const e = normEmail(r.customer_email);
          if (!e) continue;
          const cur = stripeByEmail.get(e);
          if (!cur || new Date(r.converted_at) < new Date(cur.converted_at)) {
            stripeByEmail.set(e, { mrr: Number(r.mrr || 0), converted_at: r.converted_at, plan: r.plan_name || null });
          }
        }
      }

      // ------ Build rows ------
      let matchedChatwoot = 0;
      let matchedPaying = 0;

      const rowsToInsert = norm.map((r) => {
        const phoneConvs = r.phone ? cwByPhone.get(r.phone) || [] : [];
        const emailConvs = r.email ? cwByEmail.get(r.email) || [] : [];

        let matchMethod: "phone" | "email" | null = null;
        let convs: Conv[] = [];
        if (phoneConvs.length) {
          matchMethod = "phone";
          convs = phoneConvs;
        } else if (emailConvs.length) {
          matchMethod = "email";
          convs = emailConvs;
        }

        // sort by first_contact_message_at || opened_at ascending
        convs = convs
          .map((c) => ({ c, ts: c.first_contact_message_at || c.opened_at }))
          .filter((x) => x.ts)
          .sort((a, b) => new Date(a.ts!).getTime() - new Date(b.ts!).getTime())
          .map((x) => x.c);

        const first = convs[0] || null;
        const firstTs = first ? first.first_contact_message_at || first.opened_at : null;

        // last conv = most recent by last_message_at
        const lastConv = [...convs].sort((a, b) => {
          const ta = new Date(a.last_message_at || a.opened_at || 0).getTime();
          const tb = new Date(b.last_message_at || b.opened_at || 0).getTime();
          return tb - ta;
        })[0];

        const customerReplied = convs.some((c) => !!c.first_contact_message_at);

        const hours =
          firstTs && r.created_at
            ? (new Date(firstTs).getTime() - new Date(r.created_at).getTime()) / 3600000
            : null;
        const bucket = bucketOf(hours);

        const stripe = r.email ? stripeByEmail.get(r.email) : null;

        if (matchMethod) matchedChatwoot += 1;
        if (stripe) matchedPaying += 1;

        return {
          import_id: imp.id,
          row_index: r.row_index,
          lead_email: r.email,
          lead_phone_raw: r.phone_raw,
          lead_phone_normalized: r.phone,
          lead_name: r.name,
          lead_origin: r.origin,
          lead_campaign: r.campaign,
          lead_created_at: r.created_at,
          extra: r.extra,
          cw_match_method: matchMethod,
          cw_conversation_ids: convs.map((c) => c.chatwoot_conversation_id),
          cw_first_contact_at: firstTs,
          cw_first_agent_name: first?.assignee_name || null,
          cw_first_agent_email: first?.assignee_email || null,
          cw_total_conversations: convs.length,
          cw_total_messages: 0, // not tracked at conversation table; left 0 for now
          cw_customer_replied: customerReplied,
          cw_last_status: lastConv?.status || null,
          cw_last_label:
            lastConv?.tabulacao_atendimento ||
            (lastConv?.labels && lastConv.labels.length ? lastConv.labels.join(", ") : null),
          stripe_paying: !!stripe,
          stripe_converted_at: stripe?.converted_at || null,
          stripe_mrr: stripe?.mrr || 0,
          stripe_plan: stripe?.plan || null,
          hours_to_first_contact: hours,
          sla_bucket: bucket,
        };
      });

      // Insert in chunks
      const INS = 500;
      for (let i = 0; i < rowsToInsert.length; i += INS) {
        const chunk = rowsToInsert.slice(i, i + INS);
        const { error } = await admin.from("lead_import_rows").insert(chunk);
        if (error) throw error;
      }

      await admin
        .from("lead_imports")
        .update({
          matched_chatwoot: matchedChatwoot,
          matched_paying: matchedPaying,
          status: "done",
        })
        .eq("id", imp.id);

      return json({ import_id: imp.id, ...(await buildReport(admin, imp.id)) });
    } catch (e: any) {
      await admin
        .from("lead_imports")
        .update({ status: "error", error_message: String(e?.message || e) })
        .eq("id", imp.id);
      throw e;
    }
  } catch (e: any) {
    console.error("lead-csv-audit error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function buildReport(admin: any, import_id: string) {
  const { data: imp, error: impErr } = await admin
    .from("lead_imports")
    .select("*")
    .eq("id", import_id)
    .single();
  if (impErr) throw impErr;

  const { data: rows, error: rowsErr } = await admin
    .from("lead_import_rows")
    .select("*")
    .eq("import_id", import_id)
    .order("row_index", { ascending: true })
    .limit(20000);
  if (rowsErr) throw rowsErr;

  const total = rows.length;
  const contacted = rows.filter((r: any) => r.cw_match_method).length;
  const replied = rows.filter((r: any) => r.cw_customer_replied).length;
  const paying = rows.filter((r: any) => r.stripe_paying).length;
  const mrrTotal = rows.reduce((s: number, r: any) => s + Number(r.stripe_mrr || 0), 0);
  const slaHours = rows.filter((r: any) => r.hours_to_first_contact != null).map((r: any) => Number(r.hours_to_first_contact));
  const avgSla = slaHours.length ? slaHours.reduce((a: number, b: number) => a + b, 0) / slaHours.length : null;

  const BUCKETS = ["<24h", "1-3d", "4-7d", ">7d", "Sem contato"];
  const slaBuckets = BUCKETS.map((b) => ({
    bucket: b,
    count: rows.filter((r: any) => r.sla_bucket === b).length,
  }));

  const tsMap = new Map<string, { date: string; received: number; contacted: number; replied: number; paying: number }>();
  for (const r of rows) {
    if (!r.lead_created_at) continue;
    const dk = new Date(r.lead_created_at).toISOString().slice(0, 10);
    const cur = tsMap.get(dk) || { date: dk, received: 0, contacted: 0, replied: 0, paying: 0 };
    cur.received += 1;
    if (r.cw_match_method) cur.contacted += 1;
    if (r.cw_customer_replied) cur.replied += 1;
    if (r.stripe_paying) cur.paying += 1;
    tsMap.set(dk, cur);
  }
  const timeseries = Array.from(tsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  function groupBy(keyFn: (r: any) => string | null) {
    const m = new Map<string, { key: string; leads: number; contacted: number; replied: number; paying: number; mrr: number }>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!k) continue;
      const cur = m.get(k) || { key: k, leads: 0, contacted: 0, replied: 0, paying: 0, mrr: 0 };
      cur.leads += 1;
      if (r.cw_match_method) cur.contacted += 1;
      if (r.cw_customer_replied) cur.replied += 1;
      if (r.stripe_paying) {
        cur.paying += 1;
        cur.mrr += Number(r.stripe_mrr || 0);
      }
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.leads - a.leads);
  }

  const byAgent = groupBy((r: any) => r.cw_first_agent_name || (r.cw_first_agent_email ? r.cw_first_agent_email : null));
  const byOrigin = groupBy((r: any) => r.lead_origin || null);
  const byCampaign = groupBy((r: any) => r.lead_campaign || null);

  return {
    import: imp,
    kpis: {
      total,
      contacted,
      contacted_pct: total ? (contacted / total) * 100 : 0,
      replied,
      replied_pct: total ? (replied / total) * 100 : 0,
      paying,
      paying_pct: total ? (paying / total) * 100 : 0,
      mrr_total: mrrTotal,
      avg_sla_hours: avgSla,
    },
    sla_buckets: slaBuckets,
    timeseries,
    by_agent: byAgent,
    by_origin: byOrigin,
    by_campaign: byCampaign,
    rows,
  };
}
