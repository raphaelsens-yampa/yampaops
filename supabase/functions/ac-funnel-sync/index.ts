import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  AC_API_KEY,
  AC_API_URL,
  acFetch,
  admin,
  corsHeaders,
  iso,
  num,
  writeEvents,
  type StoredDeal,
} from "../_shared/acFunnel.ts";

const PAGE = 100;

async function isAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return false;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) return false;
  const { data } = await client.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  return data === true;
}

async function loadOwners(): Promise<Record<string, string>> {
  try {
    const data = await acFetch("users?limit=100");
    const map: Record<string, string> = {};
    for (const u of data.users ?? []) {
      map[String(u.id)] = u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : (u.username ?? u.email ?? "");
    }
    return map;
  } catch (e) {
    console.error("loadOwners failed:", (e as Error).message);
    return {};
  }
}

async function syncStages(db: ReturnType<typeof admin>, groupId: string) {
  const data = await acFetch(`dealGroups/${groupId}/stages?limit=100`);
  const rows = (data.dealStages ?? []).map((s: any) => ({
    ac_stage_id: String(s.id),
    ac_group_id: groupId,
    title: s.title ?? "",
    position: num(s.order),
    color: s.color ? `#${String(s.color).replace(/^#/, "")}` : null,
  }));
  if (rows.length) {
    const { error } = await db.from("ac_funnel_stages").upsert(rows, { onConflict: "ac_stage_id" });
    if (error) throw new Error(`stages upsert: ${error.message}`);
  }
  return rows.length;
}

async function syncFunnel(db: ReturnType<typeof admin>, groupId: string, owners: Record<string, string>) {
  const stages = await syncStages(db, groupId);

  const { data: storedRows, error: storedErr } = await db
    .from("ac_funnel_deals")
    .select("ac_deal_id, ac_group_id, ac_stage_id, status, value, contact_email, owner_name")
    .eq("ac_group_id", groupId);
  if (storedErr) throw new Error(`load stored deals: ${storedErr.message}`);
  const stored = new Map<string, StoredDeal>();
  for (const r of storedRows ?? []) stored.set(String(r.ac_deal_id), r as StoredDeal);

  let offset = 0;
  let total = Infinity;
  let deals = 0;
  let events = 0;
  const nowIso = new Date().toISOString();

  while (offset < total) {
    const data = await acFetch(
      `deals?filters%5Bgroup%5D=${encodeURIComponent(groupId)}&include=contact&limit=${PAGE}&offset=${offset}&orders%5Bcdate%5D=ASC`,
    );
    total = num(data.meta?.total);
    const contacts: Record<string, any> = {};
    for (const c of data.contacts ?? []) contacts[String(c.id)] = c;

    const batch = data.deals ?? [];
    if (!batch.length) break;

    const upserts: Record<string, unknown>[] = [];
    for (const d of batch) {
      const id = String(d.id);
      const contact = contacts[String(d.contact)] ?? null;
      const next = {
        ac_deal_id: id,
        ac_group_id: groupId,
        ac_stage_id: d.stage ? String(d.stage) : null,
        status: num(d.status),
        value: num(d.value) / 100,
        contact_email: contact?.email ? String(contact.email).toLowerCase() : null,
        owner_name: owners[String(d.owner)] ?? null,
        deal_created_at: iso(d.cdate),
        occurred_at: iso(d.mdate) ?? nowIso,
      };
      const prev = stored.get(id) ?? null;
      events += await writeEvents(db, prev, next, "sync");

      upserts.push({
        ac_deal_id: id,
        ac_group_id: groupId,
        ac_stage_id: next.ac_stage_id,
        title: d.title ?? null,
        contact_name: contact ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || null : null,
        contact_email: next.contact_email,
        ac_contact_id: d.contact ? String(d.contact) : null,
        owner_id: d.owner ? String(d.owner) : null,
        owner_name: next.owner_name,
        value: next.value,
        currency: d.currency ?? null,
        status: next.status,
        deal_created_at: next.deal_created_at,
        deal_updated_at: iso(d.mdate),
        stage_changed_at: prev && (prev.ac_stage_id ?? "") !== (next.ac_stage_id ?? "") ? next.occurred_at : undefined,
        closed_at: next.status === 1 || next.status === 2 ? (iso(d.mdate) ?? nowIso) : null,
      });
      deals++;
    }

    const clean = upserts.map((u) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(u)) if (v !== undefined) o[k] = v;
      return o;
    });
    const { error } = await db.from("ac_funnel_deals").upsert(clean, { onConflict: "ac_deal_id" });
    if (error) throw new Error(`deals upsert: ${error.message}`);

    offset += PAGE;
    if (offset > 20000) break;
  }

  await db
    .from("ac_funnels")
    .update({ last_sync_at: nowIso, deals_count: deals })
    .eq("ac_group_id", groupId);

  return { group_id: groupId, stages, deals, events };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!AC_API_URL || !AC_API_KEY) return json({ error: "AC_API_URL/AC_API_KEY não configurados" }, 500);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = !!cronSecret && cronSecret === Deno.env.get("AC_WEBHOOK_SECRET");

    if (!isCron && !(await isAdmin(req))) return json({ error: "forbidden" }, 403);

    const db = admin();
    const action = String(body.action ?? "sync");

    if (action === "list_funnels") {
      const out: any[] = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const data = await acFetch(`dealGroups?limit=100&offset=${offset}`);
        total = num(data.meta?.total);
        const groups = data.dealGroups ?? [];
        if (!groups.length) break;
        for (const g of groups) {
          out.push({ ac_group_id: String(g.id), title: g.title ?? "", ac_deals_count: num(g.count) });
        }
        offset += 100;
      }
      const { data: existing } = await db.from("ac_funnels").select("ac_group_id, is_connected");
      const conn = new Map((existing ?? []).map((r: any) => [String(r.ac_group_id), r.is_connected]));
      const rows = out.map((g) => ({
        ac_group_id: g.ac_group_id,
        title: g.title,
        is_connected: conn.get(g.ac_group_id) ?? false,
      }));
      if (rows.length) await db.from("ac_funnels").upsert(rows, { onConflict: "ac_group_id" });
      return json({ ok: true, funnels: out });
    }

    if (action === "connect") {
      const groupId = String(body.groupId ?? "");
      const connected = body.connected !== false;
      if (!groupId) return json({ error: "groupId obrigatório" }, 400);
      const { error } = await db.from("ac_funnels").upsert(
        {
          ac_group_id: groupId,
          title: String(body.title ?? groupId),
          is_connected: connected,
          connected_at: connected ? new Date().toISOString() : null,
        },
        { onConflict: "ac_group_id" },
      );
      if (error) return json({ error: error.message }, 400);
      if (connected) {
        const owners = await loadOwners();
        const result = await syncFunnel(db, groupId, owners);
        return json({ ok: true, connected, result });
      }
      return json({ ok: true, connected });
    }

    // action === "sync"
    let targets: string[] = [];
    if (body.groupId) {
      targets = [String(body.groupId)];
    } else {
      const { data } = await db.from("ac_funnels").select("ac_group_id").eq("is_connected", true);
      targets = (data ?? []).map((r: any) => String(r.ac_group_id));
    }
    const owners = await loadOwners();
    const results = [];
    for (const g of targets) results.push(await syncFunnel(db, g, owners));
    return json({ ok: true, results });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("ac-funnel-sync error:", msg);
    return json({ error: msg }, 500);
  }
});
