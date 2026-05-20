import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TargetStatus = "contatado" | "respondeu";

const STATUS_RANK: Record<string, number> = {
  nao_trabalhado: 0,
  sem_telefone: 0,
  descartado: 0,
  contatado: 1,
  respondeu: 2,
  agendado: 3,
  convertido: 4,
};

function normalizePhoneDigits(input?: string | null): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D+/g, "");
  if (digits.length < 8) return null;
  return digits.length > 11 ? digits.slice(-11) : digits;
}

function phoneSuffixes(d: string | null): string[] {
  if (!d) return [];
  const out = new Set<string>([d]);
  if (d.length >= 10) out.add(d.slice(-10));
  if (d.length >= 11) out.add(d.slice(-11));
  return Array.from(out);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const supa = createClient(SUPABASE_URL, SERVICE_KEY);

    // Role check
    const { data: roles } = await supa.from("user_roles").select("role").eq("user_id", userId);
    const rs = new Set((roles ?? []).map((r: any) => r.role));
    if (!rs.has("admin") && !rs.has("tatico")) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const campaign_id: string | undefined = body?.campaign_id;
    const label: string | undefined = body?.label;
    const target_status: TargetStatus = body?.target_status === "respondeu" ? "respondeu" : "contatado";
    const add_missing: boolean = body?.add_missing !== false; // default true

    if (!campaign_id || !label) {
      return new Response(JSON.stringify({ error: "campaign_id e label são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Carrega conversas com a label
    const conversations: any[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supa
          .from("chatwoot_conversations")
          .select("chatwoot_contact_id, contact_phone, contact_email, contact_name, labels")
          .contains("labels", [label])
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        conversations.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Conjunto de chatwoot_contact_ids com a label
    const cwIds = Array.from(
      new Set(conversations.map((c) => c.chatwoot_contact_id).filter((v) => v != null)),
    ) as number[];

    // 2) Carrega chatwoot_contacts para esses ids (para pegar phone/email normalizados)
    const cwContacts = new Map<number, any>();
    if (cwIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < cwIds.length; i += CHUNK) {
        const slice = cwIds.slice(i, i + CHUNK);
        const { data, error } = await supa
          .from("chatwoot_contacts")
          .select("chatwoot_contact_id, name, email, phone_e164, phone_digits")
          .in("chatwoot_contact_id", slice);
        if (error) throw error;
        for (const r of data || []) cwContacts.set(Number(r.chatwoot_contact_id), r);
      }
    }

    // Monta índice por telefone (sufixos) e por email
    type CwRec = { cwId: number; name: string | null; email: string | null; phone: string | null; phoneDigits: string | null };
    const records: CwRec[] = [];
    const byPhone = new Map<string, CwRec>();
    const byEmail = new Map<string, CwRec>();

    // Indexa a partir dos chatwoot_contacts
    for (const id of cwIds) {
      const cw = cwContacts.get(id);
      const convFallback = conversations.find((c) => c.chatwoot_contact_id === id) || {};
      const phoneDigits =
        cw?.phone_digits || normalizePhoneDigits(cw?.phone_e164) || normalizePhoneDigits(convFallback?.contact_phone);
      const email = (cw?.email || convFallback?.contact_email || "").toString().trim().toLowerCase() || null;
      const rec: CwRec = {
        cwId: id,
        name: cw?.name || convFallback?.contact_name || null,
        email,
        phone: cw?.phone_e164 || convFallback?.contact_phone || null,
        phoneDigits,
      };
      records.push(rec);
      for (const sfx of phoneSuffixes(phoneDigits)) {
        if (!byPhone.has(sfx)) byPhone.set(sfx, rec);
      }
      if (email && !byEmail.has(email)) byEmail.set(email, rec);
    }

    // 3) Itera contatos da campanha e tenta match
    const PAGE = 1000;
    let from = 0;
    let scanned = 0;
    let matched = 0;
    let promoted = 0;
    let skippedHigher = 0;
    const matchedCwIds = new Set<number>();
    const targetRank = STATUS_RANK[target_status];

    while (true) {
      const { data: contacts, error } = await supa
        .from("sales_campaign_contacts")
        .select("id, status, phone_digits, email_norm, email, matched_chatwoot_contact_id, match_method")
        .eq("campaign_id", campaign_id)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!contacts || contacts.length === 0) break;

      for (const c of contacts) {
        scanned++;
        // tenta telefone primeiro
        let hit: CwRec | undefined;
        let method: string | undefined;
        const phoneCandidates = phoneSuffixes(c.phone_digits);
        for (const sfx of phoneCandidates) {
          const r = byPhone.get(sfx);
          if (r) { hit = r; method = "phone"; break; }
        }
        if (!hit) {
          const em = (c.email_norm || c.email || "").toString().trim().toLowerCase();
          if (em) {
            const r = byEmail.get(em);
            if (r) { hit = r; method = "email"; }
          }
        }
        if (!hit) continue;

        matched++;
        matchedCwIds.add(hit.cwId);

        const currentRank = STATUS_RANK[c.status] ?? 0;
        const update: Record<string, any> = {
          matched_chatwoot_contact_id: hit.cwId,
          match_method: c.match_method || method,
          last_touch_at: new Date().toISOString(),
        };
        if (currentRank < targetRank) {
          update.status = target_status;
          promoted++;
        } else {
          skippedHigher++;
        }

        const { error: updErr } = await supa
          .from("sales_campaign_contacts")
          .update(update)
          .eq("id", c.id);
        if (updErr) console.error("update fail", c.id, updErr.message);
      }

      if (contacts.length < PAGE) break;
      from += PAGE;
    }

    // 4) Adiciona à base os chatwoot contacts com tag que não estavam na base
    let inserted = 0;
    if (add_missing) {
      const toInsert: any[] = [];
      for (const rec of records) {
        if (matchedCwIds.has(rec.cwId)) continue;
        if (!rec.phoneDigits && !rec.email) continue;
        toInsert.push({
          campaign_id,
          name: rec.name,
          email: rec.email,
          phone: rec.phone,
          status: target_status,
          matched_chatwoot_contact_id: rec.cwId,
          match_method: rec.phoneDigits ? "phone" : "email",
          last_touch_at: new Date().toISOString(),
          extra: { source: "chatwoot_tag_sync", label },
        });
      }
      if (toInsert.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const slice = toInsert.slice(i, i + CHUNK);
          const { error, count } = await supa
            .from("sales_campaign_contacts")
            .insert(slice, { count: "exact" });
          if (error) {
            console.error("insert fail", error.message);
          } else {
            inserted += count ?? slice.length;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        label,
        target_status,
        conversations_with_label: conversations.length,
        chatwoot_contacts_with_label: cwIds.length,
        scanned,
        matched,
        promoted,
        skipped_already_higher: skippedHigher,
        inserted_new: inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
