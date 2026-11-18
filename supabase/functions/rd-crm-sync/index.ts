// Sincroniza funis do RD Station CRM nas mesmas tabelas de funis (crm_source='rd'),
// para que as telas leiam o histórico do ActiveCampaign + RD novo sem mudanças.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { admin, corsHeaders, iso, num, writeEvents, type StoredDeal } from "../_shared/acFunnel.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_rd_station_crm";
const FUNNEL_MATCH = (name: string) => /^\[Sales\]/i.test(name) || /^outbound$/i.test(name.trim());

async function rd(path: string, params: Record<string, string> = {}): Promise<any> {
  const lov = Deno.env.get("LOVABLE_API_KEY");
  const key = Deno.env.get("UDC_RD_STATION_CRM_API_KEY");
  if (!lov || !key) throw new Error("LOVABLE_API_KEY/UDC_RD_STATION_CRM_API_KEY ausentes");
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GATEWAY_URL}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}]: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function isAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get("Authorization") ?? "";
  if (!h) return false;
  const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: h } }, auth: { persistSession: false },
  });
  const { data: u } = await c.auth.getUser();
  if (!u?.user) return false;
  const { data } = await c.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  return data === true;
}

async function fetchDeals(pipelineId: string): Promise<any[]> {
  const out = new Map<string, any>();
  let cursor: string | null = null;
  for (let i = 0; i < 200; i++) {
    const params: Record<string, string> = { deal_pipeline_id: pipelineId, limit: "200" };
    if (cursor) params.next_page = cursor;
    const data = await rd("/deals", params);
    for (const d of data.deals ?? []) out.set(String(d.id), d);
    if (!data.has_more || !data.next_page || data.next_page === cursor) break;
    cursor = data.next_page;
  }
  return Array.from(out.values());
}

async function syncPipeline(db: ReturnType<typeof admin>, p: any) {
  const groupId = String(p.id);
  const nowIso = new Date().toISOString();
  await db.from("ac_funnels").upsert({
    ac_group_id: groupId, title: String(p.name), is_connected: true, crm_source: "rd",
  }, { onConflict: "ac_group_id" });
  const stages = (p.deal_stages ?? []).map((s: any) => ({
    ac_stage_id: String(s.id), ac_group_id: groupId, title: s.name ?? "", position: num(s.order), color: null,
  }));
  if (stages.length) {
    const { error } = await db.from("ac_funnel_stages").upsert(stages, { onConflict: "ac_stage_id" });
    if (error) throw new Error(`stages: ${error.message}`);
  }

  const { data: storedRows, error: se } = await db.from("ac_funnel_deals")
    .select("ac_deal_id, ac_group_id, ac_stage_id, status, value, contact_email, owner_name, closed_at")
    .eq("ac_group_id", groupId);
  if (se) throw new Error(`stored: ${se.message}`);
  const stored = new Map<string, StoredDeal>((storedRows ?? []).map((r: any) => [String(r.ac_deal_id), r]));

  const deals = await fetchDeals(groupId);
  const rows: Record<string, unknown>[] = [];
  let events = 0;
  for (const d of deals) {
    const id = String(d.id);
    const contact = d.contacts?.[0] ?? null;
    const email = contact?.emails?.[0]?.email ? String(contact.emails[0].email).toLowerCase() : null;
    const status = d.win === true ? 1 : d.win === false ? 2 : 0;
    const value = num(d.amount_montly) || num(d.amount_total);
    const next = {
      ac_deal_id: id, ac_group_id: groupId, ac_stage_id: d.deal_stage?.id ? String(d.deal_stage.id) : null,
      status, value, contact_email: email, owner_name: d.user?.name ?? null,
      deal_created_at: iso(d.created_at), occurred_at: iso(d.updated_at) ?? nowIso,
    };
    const prev = stored.get(id) ?? null;
    const changed = !prev || (prev.ac_stage_id ?? "") !== (next.ac_stage_id ?? "") || num(prev.status) !== status;
    if (changed) events += await writeEvents(db, prev, next, "rd-sync");
    const row: Record<string, unknown> = {
      ...next, crm_source: "rd", title: d.name ?? null, contact_name: contact?.name ?? null,
      ac_contact_id: null, owner_id: d.user?.id ? String(d.user.id) : null, currency: "BRL",
      deal_updated_at: iso(d.updated_at), closed_at: status ? (iso(d.closed_at) ?? next.occurred_at) : null,
      loss_reason: d.deal_lost_reason?.name ?? null,
    };
    delete row.occurred_at;
    if (prev && (prev.ac_stage_id ?? "") !== (next.ac_stage_id ?? "")) row.stage_changed_at = next.occurred_at;
    rows.push(row);
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("ac_funnel_deals").upsert(rows.slice(i, i + 500), { onConflict: "ac_deal_id" });
    if (error) throw new Error(`deals: ${error.message}`);
  }
  const seen = new Set(rows.map((r) => String(r.ac_deal_id)));
  const stale = deals.length ? Array.from(stored.keys()).filter((id) => !seen.has(id)) : [];
  for (let i = 0; i < stale.length; i += 200) {
    await db.from("ac_funnel_deals").delete().eq("ac_group_id", groupId).in("ac_deal_id", stale.slice(i, i + 200));
  }
  await db.from("ac_funnels").update({ last_sync_at: nowIso, deals_count: rows.length }).eq("ac_group_id", groupId);
  return { funnel: p.name, stages: stages.length, deals: rows.length, events, removed: stale.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const db = admin();
    const secret = req.headers.get("x-cron-secret");
    let ok = !!Deno.env.get("LOVABLE_CRON_SECRET") && authenticateCronRequest(req) === null;
    if (!ok && secret) {
      const { data } = await db.from("ac_cron_tokens").select("token").eq("token", secret).maybeSingle();
      ok = !!data;
    }
    if (!ok && !(await isAdmin(req))) return json({ error: "forbidden" }, 403);
    const pipelines = (await rd("/deal_pipelines")) as any[];
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const only = body.pipeline_id ? String(body.pipeline_id) : null;
    const chosen = pipelines.filter((p) => FUNNEL_MATCH(String(p.name ?? "")) && (!only || String(p.id) === only));
    if (!only) {
      // Uma execução por funil, para não estourar o tempo limite da função.
      const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/rd-crm-sync`;
      const fan = chosen.map((p) => fetch(self, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "", "x-cron-secret": secret ?? "" },
        body: JSON.stringify({ pipeline_id: String(p.id) }),
      }).then((r) => r.text()).catch((e) => console.error("fan-out", p.name, e.message)));
      // @ts-ignore EdgeRuntime existe no runtime
      EdgeRuntime.waitUntil(Promise.all(fan));
      return json({ ok: true, started: chosen.map((p) => p.name) });
    }
    const results = [];
    for (const p of chosen) results.push(await syncPipeline(db, p));
    return json({ ok: true, results });
  } catch (e) {
    console.error("rd-crm-sync failed:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
