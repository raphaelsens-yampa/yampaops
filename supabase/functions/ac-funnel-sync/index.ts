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

const LOSS_FIELD_LABEL = /motivo de perda/i;


/** Descobre o id do campo personalizado "Deal - Sales - Motivo de perda". */
async function findLossReasonFieldId(): Promise<string | null> {
  try {
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const data = await acFetch(`dealCustomFieldMeta?limit=100&offset=${offset}`);
      total = num(data.meta?.total);
      const items = data.dealCustomFieldMeta ?? [];
      if (!items.length) break;
      const hit = items.find((m: any) => LOSS_FIELD_LABEL.test(String(m.fieldLabel ?? "")));
      if (hit) return String(hit.id);
      offset += 100;
    }
  } catch (e) {
    console.error("findLossReasonFieldId failed:", (e as Error).message);
  }
  return null;
}

/** Mapa dealId -> motivo de perda. */
async function loadLossReasons(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const fieldId = await findLossReasonFieldId();
  if (!fieldId) return out;
  try {
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const data = await acFetch(`dealCustomFieldMeta/${fieldId}/dealCustomFieldData?limit=100&offset=${offset}`);
      total = num(data.meta?.total);
      const items = data.dealCustomFieldMeta ?? data.dealCustomFieldData ?? [];
      if (!items.length) break;
      for (const it of items) {
        const v = String(it.fieldValue ?? "").trim();
        if (v) out.set(String(it.dealId), v);
      }
      offset += 100;
      if (offset > 20000) break;
    }
  } catch (e) {
    console.error("loadLossReasons failed:", (e as Error).message);
  }
  return out;
}

/** Sincroniza tarefas de negócios do funil. */
async function syncTasks(
  db: ReturnType<typeof admin>,
  groupId: string,
  owners: Record<string, string>,
  dealStage: Map<string, string | null>,
): Promise<number> {
  const types: Record<string, string> = {};
  try {
    const t = await acFetch("dealTasktypes?limit=100");
    for (const tt of t.dealTasktypes ?? []) types[String(tt.id)] = String(tt.title ?? "");
  } catch (e) {
    console.error("dealTasktypes failed:", (e as Error).message);
  }

  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const data = await acFetch(`dealTasks?limit=100&offset=${offset}&filters%5Breltype%5D=Deal`);
    total = num(data.meta?.total);
    const batch = data.dealTasks ?? [];
    if (!batch.length) break;
    for (const t of batch) {
      const dealId = String(t.relid ?? "");
      if (!dealStage.has(dealId)) continue;
      const assignee = String(t.assignee ?? t.user ?? "");
      rows.push({
        ac_task_id: String(t.id),
        ac_deal_id: dealId,
        ac_group_id: groupId,
        ac_stage_id: dealStage.get(dealId) ?? null,
        title: t.title ?? null,
        task_type_id: t.dealTasktype ? String(t.dealTasktype) : null,
        task_type: types[String(t.dealTasktype)] ?? null,
        assignee_id: assignee || null,
        owner_name: owners[assignee] ?? null,
        due_date: iso(t.duedate),
        is_done: num(t.status) === 1,
        done_at: iso(t.donedate),
        updated_at: new Date().toISOString(),
      });
    }
    offset += 100;
    if (offset > 50000) break;
  }

  // Substitui o retrato de tarefas do funil
  await db.from("ac_funnel_deal_tasks").delete().eq("ac_group_id", groupId);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("ac_funnel_deal_tasks")
      .upsert(rows.slice(i, i + 500), { onConflict: "ac_task_id" });
    if (error) console.error("tasks upsert error:", error.message);
  }
  return rows.length;
}

async function syncFunnel(db: ReturnType<typeof admin>, groupId: string, owners: Record<string, string>) {
  const stages = await syncStages(db, groupId);
  const lossReasons = await loadLossReasons();


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
  const dealStage = new Map<string, string | null>();


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
        loss_reason: lossReasons.get(id) ?? null,
      });
      dealStage.set(id, next.ac_stage_id);
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
  const tasks = await syncTasks(db, groupId, owners, dealStage);

  await db
    .from("ac_funnels")
    .update({ last_sync_at: nowIso, deals_count: deals })
    .eq("ac_group_id", groupId);

  return { group_id: groupId, stages, deals, events, tasks };
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
    const db = admin();

    let isCron = !!cronSecret && cronSecret === Deno.env.get("AC_WEBHOOK_SECRET");
    if (!isCron && cronSecret) {
      const { data: tok } = await db
        .from("ac_cron_tokens")
        .select("token")
        .eq("token", cronSecret)
        .maybeSingle();
      isCron = !!tok;
    }

    if (!isCron && !(await isAdmin(req))) return json({ error: "forbidden" }, 403);

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

    // Reconstrói eventos de Ganho/Perda a partir do snapshot de negócios (status + closed_at).
    // Útil quando o webhook não estava ativo no período.
    if (action === "backfill_closures") {
      const groupId = String(body.groupId ?? "");
      if (!groupId) return json({ error: "groupId obrigatório" }, 400);
      const fromDate = String(body.from ?? "").slice(0, 10);
      const toDate = String(body.to ?? "").slice(0, 10);
      if (!fromDate || !toDate) return json({ error: "from e to obrigatórios (YYYY-MM-DD)" }, 400);

      const { data: closed, error: qErr } = await db
        .from("ac_funnel_deals")
        .select("ac_deal_id, ac_stage_id, status, value, contact_email, owner_name, closed_at")
        .eq("ac_group_id", groupId)
        .in("status", [1, 2])
        .gte("closed_at", `${fromDate}T00:00:00-03:00`)
        .lte("closed_at", `${toDate}T23:59:59-03:00`)
        .limit(20000);
      if (qErr) return json({ error: qErr.message }, 400);

      const rows = (closed ?? []).map((d: any) => ({
        ac_deal_id: String(d.ac_deal_id),
        ac_group_id: groupId,
        event_type: d.status === 1 ? "won" : "lost",
        from_stage_id: d.ac_stage_id ?? "",
        to_stage_id: d.ac_stage_id ?? "",
        from_status: 0,
        to_status: d.status,
        deal_value: num(d.value),
        contact_email: d.contact_email ?? null,
        owner_name: d.owner_name ?? null,
        occurred_at: d.closed_at,
        source: "backfill_closures",
      }));

      let written = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await db.from("ac_funnel_stage_events").upsert(chunk, {
          onConflict: "ac_deal_id,event_type,from_stage_id,to_stage_id,occurred_at",
          ignoreDuplicates: true,
        });
        if (error) return json({ error: error.message }, 400);
        written += chunk.length;
      }

      return json({
        ok: true,
        from: fromDate,
        to: toDate,
        won: rows.filter((r) => r.event_type === "won").length,
        lost: rows.filter((r) => r.event_type === "lost").length,
        written,
      });
    }

    if (action === "backfill_activities") {

      const groupId = String(body.groupId ?? "");
      if (!groupId) return json({ error: "groupId obrigatório" }, 400);
      const days = Math.min(Math.max(num(body.days) || 180, 1), 730);
      const since = new Date(Date.now() - days * 86400000);

      // Deals do funil (mapa id -> metadados)
      const { data: dealRows } = await db
        .from("ac_funnel_deals")
        .select("ac_deal_id, value, contact_email, owner_name")
        .eq("ac_group_id", groupId);
      const dealMap = new Map<string, any>((dealRows ?? []).map((d: any) => [String(d.ac_deal_id), d]));
      const { data: stageRows } = await db
        .from("ac_funnel_stages")
        .select("ac_stage_id")
        .eq("ac_group_id", groupId);
      const validStages = new Set((stageRows ?? []).map((s: any) => String(s.ac_stage_id)));

      const dealIds = Array.from(dealMap.keys());
      const startIdx = Math.min(Math.max(num(body.startIndex), 0), dealIds.length);
      const batch = Math.min(Math.max(num(body.batchSize) || 120, 1), 400);
      const slice = dealIds.slice(startIdx, startIdx + batch);

      let scanned = 0;
      let written = 0;
      const typeCounts: Record<string, number> = {};
      const rows: Record<string, unknown>[] = [];

      for (const dealId of slice) {
        const deal = dealMap.get(dealId);
        let acts: any[] = [];
        try {
          const data = await acFetch(`dealActivities?limit=100&filters[dealid]=${dealId}`);
          acts = data.dealActivities ?? [];
        } catch (err) {
          console.error(`dealActivities ${dealId} falhou: ${(err as Error).message}`);
          continue;
        }
        // ordem cronológica para reconstruir transições
        acts.sort((a, b) => String(a.cdate ?? "").localeCompare(String(b.cdate ?? "")));
        for (const a of acts) {
          scanned++;
          const at = iso(a.cdate ?? a.sortdate);
          if (!at || new Date(at) < since) continue;
          const dataType = String(a.dataType ?? "");
          const action = String(a.dataAction ?? "");
          typeCounts[`${dataType || "-"}:${action || "-"}`] = (typeCounts[`${dataType || "-"}:${action || "-"}`] ?? 0) + 1;
          const oldV = a.dataOldval == null ? "" : String(a.dataOldval);
          const newV = String(a.d_stageid ?? "");
          const base = {
            ac_deal_id: dealId,
            ac_group_id: groupId,
            deal_value: num(deal.value),
            contact_email: deal.contact_email ?? null,
            owner_name: deal.owner_name ?? null,
            source: "backfill_activities",
            occurred_at: at,
          };

          if (dataType === "stage" && (validStages.has(newV) || validStages.has(oldV))) {
            rows.push({
              ...base,
              event_type: "stage_change",
              from_stage_id: validStages.has(oldV) ? oldV : "",
              to_stage_id: validStages.has(newV) ? newV : "",
              from_status: null,
              to_status: null,
            });
          } else if (dataType === "status") {
            const st = num(a.dataId);
            rows.push({
              ...base,
              event_type: st === 1 ? "won" : st === 2 ? "lost" : "reopened",
              from_stage_id: validStages.has(newV) ? newV : "",
              to_stage_id: validStages.has(newV) ? newV : "",
              from_status: num(oldV),
              to_status: st,
            });
          }
        }
      }

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await db.from("ac_funnel_stage_events").upsert(chunk, {
          onConflict: "ac_deal_id,event_type,from_stage_id,to_stage_id,occurred_at",
          ignoreDuplicates: true,
        });
        if (error) console.error("backfill upsert error:", error.message);
        else written += chunk.length;
      }

      const nextIndex = startIdx + slice.length;
      return json({ ok: true, scanned, candidates: rows.length, written, type_counts: typeCounts, total_deals: dealIds.length, next_index: nextIndex, done: nextIndex >= dealIds.length });
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
