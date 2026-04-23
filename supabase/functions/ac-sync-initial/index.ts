import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AC_API_URL = Deno.env.get("AC_API_URL")!.replace(/\/$/, "");
const AC_API_KEY = Deno.env.get("AC_API_KEY")!;

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Throttle: AC limit is 5 req/s
async function acFetch(path: string): Promise<any> {
  try {
    const res = await fetch(`${AC_API_URL}${path}`, {
      headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`AC ${path} -> ${res.status}: ${txt.slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 220)); // ~4.5 req/s
    return await res.json();
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`AC fetch failed: ${String(e)}`);
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message + (e.stack ? ` | ${e.stack.split("\n")[1] || ""}` : "");
  if (typeof e === "string") return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

async function logError(entity_type: string, ac_id: string | null, error_message: string, payload: any) {
  await service.from("integration_sync_errors").insert({ entity_type, ac_id, error_message: error_message || "Unknown (empty)", payload });
}

async function findUserByEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data } = await service.from("profiles").select("user_id").ilike("email", email).maybeSingle();
  return data?.user_id ?? null;
}

async function syncPipeline(acPipelineId: string, acPipelineTitle: string) {
  let stagesCount = 0, dealsCount = 0, contactsCount = 0, activitiesCount = 0;

  // 1. Upsert pipeline
  const { data: localPipe, error: pipeErr } = await service
    .from("pipelines")
    .upsert({ ac_id: acPipelineId, name: acPipelineTitle }, { onConflict: "ac_id" })
    .select("id")
    .single();
  if (pipeErr) throw pipeErr;
  const localPipelineId = localPipe.id;

  // 2. Fetch stages of this pipeline
  const stagesRes = await acFetch(`/api/3/dealStages?filters[d_groupid]=${acPipelineId}&limit=100`);
  const stages = stagesRes.dealStages || [];
  for (const s of stages) {
    const slug = (s.title || `stage-${s.id}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await service.from("pipeline_stages").upsert({
      ac_id: String(s.id),
      pipeline_id: localPipelineId,
      name: s.title,
      slug,
      position: Number(s.order ?? 0),
      color: s.color ? `#${s.color}` : null,
    }, { onConflict: "ac_id" });
    stagesCount++;
  }

  // Build stage map
  const { data: localStages } = await service.from("pipeline_stages").select("id, ac_id, slug").eq("pipeline_id", localPipelineId);
  const stageBySlug = new Map((localStages || []).map((s: any) => [s.ac_id, s.slug]));

  // 3. Fetch deals (paginated). Background tasks can run for several minutes.
  // We process up to 1500 deals per run and skip ones already synced (resume).
  const MAX_DEALS_PER_RUN = 1500;
  let offset = 0;
  const limit = 100;
  const dealIds: string[] = [];
  let truncated = false;
  let skipped = 0;

  // Preload set of already-synced AC deal ids for this pipeline (resume support)
  const { data: existingOpps } = await service
    .from("opportunities")
    .select("ac_id")
    .eq("pipeline_id", localPipelineId)
    .not("ac_id", "is", null);
  const alreadySynced = new Set((existingOpps || []).map((o: any) => o.ac_id));

  outer: while (true) {
    let dealsRes: any;
    try {
      dealsRes = await acFetch(`/api/3/deals?filters[group]=${acPipelineId}&limit=${limit}&offset=${offset}&include=contact`);
    } catch (e) {
      await logError("deal_page", acPipelineId, errorMessage(e), { offset, limit });
      break;
    }
    const deals = dealsRes.deals || [];
    const includedContacts = dealsRes.contacts || [];
    const contactsMap = new Map(includedContacts.map((c: any) => [c.id, c]));

    for (const d of deals) {
      if (alreadySynced.has(String(d.id))) {
        skipped++;
        continue;
      }
      if (dealsCount >= MAX_DEALS_PER_RUN) {
        truncated = true;
        break outer;
      }
      try {
        // 3a. Sync contact first
        let localContactId: string | null = null;
        const acContactId = d.contact;
        if (acContactId && contactsMap.has(acContactId)) {
          const c: any = contactsMap.get(acContactId);
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || `Contact ${c.id}`;
          const { data: cRow, error: cErr } = await service.from("contacts").upsert({
            ac_id: String(c.id),
            name: fullName,
            email: c.email || null,
            phone: c.phone || null,
          }, { onConflict: "ac_id" }).select("id").single();
          if (cErr) {
            await logError("contact", String(c.id), cErr.message, c);
          } else {
            localContactId = cRow.id;
            contactsCount++;
          }
        }

        // 3b. Map owner to consultant_id (skip the extra AC fetch — too expensive on big pipelines)
        const consultantId = await findUserByEmail(d.ownerEmail || d.owner_email);

        const stageSlug = stageBySlug.get(String(d.stage)) ?? "novo_lead";

        const { error: dErr } = await service.from("opportunities").upsert({
          ac_id: String(d.id),
          name: d.title || `Deal ${d.id}`,
          title: d.title || null,
          company: null,
          contact_id: localContactId,
          consultant_id: consultantId,
          pipeline_id: localPipelineId,
          stage: stageSlug,
          estimated_mrr: d.value ? Number(d.value) / 100 : 0,
          origin: "freetrial",
        }, { onConflict: "ac_id" });

        if (dErr) {
          await logError("deal", String(d.id), dErr.message, d);
        } else {
          dealsCount++;
          dealIds.push(String(d.id));
        }
      } catch (e) {
        await logError("deal", String(d.id), errorMessage(e), d);
      }
    }

    if (deals.length < limit) break;
    offset += limit;
  }

  // 4. Notes sync skipped on initial pull (too expensive on big pipelines, comes via webhook)

  await service.from("ac_pipeline_selection").update({
    local_pipeline_id: localPipelineId,
    last_synced_at: new Date().toISOString(),
  }).eq("ac_pipeline_id", acPipelineId);

  return { stagesCount, dealsCount, contactsCount, activitiesCount, truncated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", claims.claims.sub);
    if (!roles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await service.from("integration_settings").update({ sync_status: "running" }).neq("id", "00000000-0000-0000-0000-000000000000");

    const { data: selected } = await service.from("ac_pipeline_selection").select("*").eq("is_selected", true);
    if (!selected || selected.length === 0) {
      await service.from("integration_settings").update({ sync_status: "idle" }).neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(JSON.stringify({ ok: true, message: "Nenhum pipeline selecionado", results: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Run sync in background so HTTP doesn't time out (150s limit)
    const backgroundWork = (async () => {
      const results: any[] = [];
      const totals = { stagesCount: 0, dealsCount: 0, contactsCount: 0, activitiesCount: 0 };

      for (const sel of selected) {
        try {
          const r = await syncPipeline(sel.ac_pipeline_id, sel.ac_pipeline_title);
          results.push({ pipeline: sel.ac_pipeline_title, ...r });
          totals.stagesCount += r.stagesCount;
          totals.dealsCount += r.dealsCount;
          totals.contactsCount += r.contactsCount;
          totals.activitiesCount += r.activitiesCount;
        } catch (e) {
          const msg = errorMessage(e);
          await logError("pipeline", sel.ac_pipeline_id, msg, sel);
          results.push({ pipeline: sel.ac_pipeline_title, error: msg });
        }
      }

      await service.from("integration_settings").update({
        sync_status: "idle",
        last_full_sync_at: new Date().toISOString(),
        sync_log: { results, totals, ranAt: new Date().toISOString() },
      }).neq("id", "00000000-0000-0000-0000-000000000000");
    })();

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(backgroundWork);
    else backgroundWork.catch((e) => console.error("bg sync error", e));

    return new Response(JSON.stringify({
      ok: true,
      message: "Sincronização iniciada em segundo plano. Acompanhe o status na página em alguns minutos.",
      pipelines: selected.length,
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await service.from("integration_settings").update({ sync_status: "error" }).neq("id", "00000000-0000-0000-0000-000000000000");
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
