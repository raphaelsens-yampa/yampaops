import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({ campaign_id: z.string().uuid().optional() }).optional();

const AC_API_URL = (Deno.env.get("AC_API_URL") || "").replace(/\/$/, "");
const AC_API_KEY = Deno.env.get("AC_API_KEY") || "";

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchLastStageLog(acDealId: string): Promise<{ stage_ac_id: string; cdate: string } | null> {
  if (!AC_API_URL || !AC_API_KEY) return null;
  try {
    const url = `${AC_API_URL}/api/3/dealStageLogs?filters[deal]=${encodeURIComponent(acDealId)}&orders[cdate]=DESC&limit=1`;
    const res = await fetch(url, { headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    const log = (j?.dealStageLogs || [])[0];
    if (!log) return null;
    return { stage_ac_id: String(log.stage), cdate: log.cdate };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!AC_API_URL || !AC_API_KEY) return json({ error: "AC credentials missing" }, 500);

    let body: any = {};
    try { body = await req.json(); } catch {}
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const campaign_id = parsed.data?.campaign_id;

    // Build list of opportunity ids to sync
    let oppIds: string[] | null = null;
    if (campaign_id) {
      const { data: scc } = await service
        .from("sales_campaign_contacts")
        .select("matched_opportunity_id")
        .eq("campaign_id", campaign_id)
        .not("matched_opportunity_id", "is", null);
      oppIds = Array.from(new Set((scc || []).map((r: any) => r.matched_opportunity_id))) as string[];
      if (oppIds.length === 0) return json({ synced_deals: 0, updated_contacts: 0, errors: [] });
    }

    // Fetch opportunities with ac_id
    let oppQuery = service.from("opportunities")
      .select("id, ac_id, stage, pipeline_id")
      .not("ac_id", "is", null);
    if (oppIds) oppQuery = oppQuery.in("id", oppIds);
    const { data: opps, error: oppErr } = await oppQuery;
    if (oppErr) return json({ error: oppErr.message }, 500);

    // Preload stage map (ac_id -> slug) per pipeline
    const stageCache = new Map<string, string>(); // key = `${pipeline_id}|${stage_ac_id}` -> slug

    let syncedDeals = 0;
    let updatedContacts = 0;
    const errors: any[] = [];

    const BATCH = 20;
    for (let i = 0; i < (opps || []).length; i += BATCH) {
      const slice = (opps || []).slice(i, i + BATCH);
      const results = await Promise.all(slice.map(async (opp: any) => {
        const log = await fetchLastStageLog(String(opp.ac_id));
        if (!log) return null;
        const cacheKey = `${opp.pipeline_id}|${log.stage_ac_id}`;
        let slug = stageCache.get(cacheKey);
        if (!slug) {
          const { data: stage } = await service.from("pipeline_stages")
            .select("slug").eq("ac_id", log.stage_ac_id).maybeSingle();
          slug = stage?.slug;
          if (slug) stageCache.set(cacheKey, slug);
        }
        if (!slug) return null;
        return { opp, slug, changed_at: log.cdate };
      }));

      for (const r of results) {
        if (!r) continue;
        const { opp, slug, changed_at } = r;
        const update: any = { ac_stage_changed_at: changed_at };
        if (slug !== opp.stage) {
          update.previous_stage = opp.stage;
          update.stage = slug;
        }
        const { error: uErr } = await service.from("opportunities").update(update).eq("id", opp.id);
        if (uErr) { errors.push({ ac_id: opp.ac_id, error: uErr.message }); continue; }
        syncedDeals++;

        // Update campaign contacts linked to this opportunity
        let sccQuery = service.from("sales_campaign_contacts")
          .update({
            ac_last_stage: slug,
            ac_last_stage_at: changed_at,
            ac_synced_at: new Date().toISOString(),
            matched_ac_deal_id: String(opp.ac_id),
          })
          .eq("matched_opportunity_id", opp.id);
        if (campaign_id) sccQuery = sccQuery.eq("campaign_id", campaign_id);
        const { error: sErr, count } = await sccQuery.select("id", { count: "exact", head: true });
        if (sErr) errors.push({ ac_id: opp.ac_id, error: sErr.message });
        else updatedContacts += count || 0;
      }
      await sleep(250);
    }

    return json({ synced_deals: syncedDeals, updated_contacts: updatedContacts, errors });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
