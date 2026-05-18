import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireManager(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 };
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error } = await supabase.auth.getClaims(token);
  if (error || !claims?.claims) return { error: "Unauthorized", status: 401 };
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", claims.claims.sub);
  const ok = roles?.some((r: any) => r.role === "admin" || r.role === "tatico");
  if (!ok) return { error: "Forbidden", status: 403 };
  return { userId: claims.claims.sub };
}

function normalizePhoneDigits(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.length > 11 ? d.slice(-11) : d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireManager(req);
    if ("error" in auth) {
      return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "contacts";
    const AC_API_URL = Deno.env.get("AC_API_URL")!;
    const AC_API_KEY = Deno.env.get("AC_API_KEY")!;
    const base = AC_API_URL.replace(/\/$/, "");
    const headers = { "Api-Token": AC_API_KEY, "Accept": "application/json" };

    // Action: list available AC lists
    if (action === "lists") {
      const all: any[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const res = await fetch(`${base}/api/3/lists?limit=${limit}&offset=${offset}`, { headers });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: `AC ${res.status}: ${(await res.text()).slice(0, 200)}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const data = await res.json();
        const lists = data.lists || [];
        all.push(...lists.map((l: any) => ({ id: l.id, name: l.name, subscribers: Number(l.subscriber_count || 0) })));
        if (lists.length < limit) break;
        offset += limit;
        if (offset > 2000) break;
      }
      return new Response(JSON.stringify({ lists: all }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Action: contacts of a list, cross-matched with chatwoot_contacts
    const listId = url.searchParams.get("list_id");
    if (!listId) {
      return new Response(JSON.stringify({ error: "list_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const all: any[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const res = await fetch(`${base}/api/3/contacts?listid=${encodeURIComponent(listId)}&status=1&limit=${limit}&offset=${offset}`, { headers });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `AC ${res.status}: ${(await res.text()).slice(0, 200)}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const data = await res.json();
      const contacts = data.contacts || [];
      all.push(...contacts);
      if (contacts.length < limit) break;
      offset += limit;
      if (offset > 20000) break; // safety cap
    }

    // Build match indexes
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const emails = Array.from(new Set(all.map((c) => (c.email || "").toLowerCase().trim()).filter(Boolean)));
    const phones = Array.from(new Set(all.map((c) => normalizePhoneDigits(c.phone)).filter(Boolean) as string[]));

    // Fetch chatwoot contacts in batches
    const cwByEmail = new Map<string, any>();
    const cwByPhone = new Map<string, any>();
    const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

    for (const batch of chunk(emails, 500)) {
      const { data } = await service.from("chatwoot_contacts").select("chatwoot_contact_id, email, phone_digits, name").in("email", batch);
      data?.forEach((d: any) => { if (d.email) cwByEmail.set(d.email, d); });
    }
    for (const batch of chunk(phones, 500)) {
      const { data } = await service.from("chatwoot_contacts").select("chatwoot_contact_id, email, phone_digits, name").in("phone_digits", batch);
      data?.forEach((d: any) => { if (d.phone_digits) cwByPhone.set(d.phone_digits, d); });
    }

    // Fetch conversations for matched chatwoot contact ids
    const cwIds = Array.from(new Set([...cwByEmail.values(), ...cwByPhone.values()].map((c: any) => c.chatwoot_contact_id).filter(Boolean)));
    const convoByCwId = new Map<number, any>();
    for (const batch of chunk(cwIds, 500)) {
      const { data } = await service
        .from("chatwoot_conversations")
        .select("chatwoot_contact_id, chatwoot_conversation_id, assignee_name, assignee_email, status, created_at, first_contact_message_at, first_response_at, last_message_at, inbox_name")
        .in("chatwoot_contact_id", batch)
        .order("created_at", { ascending: false });
      data?.forEach((d: any) => {
        if (!convoByCwId.has(d.chatwoot_contact_id)) convoByCwId.set(d.chatwoot_contact_id, d);
      });
    }

    const rows = all.map((c) => {
      const email = (c.email || "").toLowerCase().trim() || null;
      const phoneDigits = normalizePhoneDigits(c.phone);
      const cw = (email && cwByEmail.get(email)) || (phoneDigits && cwByPhone.get(phoneDigits)) || null;
      const matchMethod = cw ? (email && cwByEmail.get(email) ? "email" : "phone") : null;
      const convo = cw ? convoByCwId.get(cw.chatwoot_contact_id) : null;
      return {
        ac_contact_id: c.id,
        first_name: c.firstName || null,
        last_name: c.lastName || null,
        email,
        phone: c.phone || null,
        phone_digits: phoneDigits,
        created: c.cdate || null,
        contactado: !!convo,
        match_method: matchMethod,
        agente: convo?.assignee_name || null,
        agente_email: convo?.assignee_email || null,
        inbox: convo?.inbox_name || null,
        conversa_status: convo?.status || null,
        conversa_id: convo?.chatwoot_conversation_id || null,
        primeira_resposta_agente: convo?.first_response_at || null,
        primeira_mensagem_cliente: convo?.first_contact_message_at || null,
        respondeu: !!convo?.first_contact_message_at,
      };
    });

    const total = rows.length;
    const contactados = rows.filter((r) => r.contactado).length;
    const responderam = rows.filter((r) => r.respondeu).length;

    return new Response(JSON.stringify({ ok: true, total, contactados, responderam, rows }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
