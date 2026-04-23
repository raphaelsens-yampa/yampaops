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
  const res = await fetch(`${AC_API_URL}${path}`, {
    headers: { "Api-Token": AC_API_KEY, "Accept": "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AC ${path} -> ${res.status}: ${txt.slice(0, 200)}`);
  }
  await new Promise((r) => setTimeout(r, 220)); // ~4.5 req/s
  return res.json();
}

async function logError(entity_type: string, ac_id: string | null, error_message: string, payload: any) {
  await service.from("integration_sync_errors").insert({ entity_type, ac_id, error_message, payload });
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

  // 3. Fetch deals (paginated)
  let offset = 0;
  const limit = 100;
  const dealIds: string[] = [];

  while (true) {
    const dealsRes = await acFetch(`/api/3/deals?filters[group]=${acPipelineId}&limit=${limit}&offset=${offset}&include=contact`);
    const deals = dealsRes.deals || [];
    const includedContacts = dealsRes.contacts || [];
    const contactsMap = new Map(includedContacts.map((c: any) => [c.id, c]));

    for (const d of deals) {
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

        // 3b. Map owner to consultant_id
        const consultantId = await findUserByEmail(d.ownerEmail || d.owner_email);
        if (d.owner && !consultantId) {
          // Try fetching user from AC
          try {
            const u = await acFetch(`/api/3/users/${d.owner}`);
            const ownerEmail = u.user?.email;
            const cid = await findUserByEmail(ownerEmail);
            if (!cid && ownerEmail) {
              await logError("deal_owner", String(d.id), `Owner ${ownerEmail} not found in profiles`, { dealId: d.id, email: ownerEmail });
            }
          } catch (_) { /* ignore */ }
        }

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
          origin: "outbound",
        }, { onConflict: "ac_id" });

        if (dErr) {
          await logError("deal", String(d.id), dErr.message, d);
        } else {
          dealsCount++;
          dealIds.push(String(d.id));
        }
      } catch (e) {
        await logError("deal", String(d.id), e instanceof Error ? e.message : "Unknown", d);
      }
    }

    if (deals.length < limit) break;
    offset += limit;
  }

  // 4. Sync notes for these deals (best effort, limited to first 50 deals to avoid huge syncs)
  for (const acDealId of dealIds.slice(0, 50)) {
    try {
      const notesRes = await acFetch(`/api/3/deals/${acDealId}/dealNotes?limit=20`);
      const notes = notesRes.dealNotes || [];
      const { data: opp } = await service.from("opportunities").select("id, consultant_id").eq("ac_id", acDealId).maybeSingle();
      if (!opp) continue;

      for (const n of notes) {
        await service.from("activities").upsert({
          ac_id: `note-${n.id}`,
          lead_id: opp.id,
          opportunity_id: opp.id,
          user_id: opp.consultant_id || (await service.from("profiles").select("user_id").limit(1).single()).data?.user_id,
          type: "mensagem_enviada",
          notes: n.note || "",
        }, { onConflict: "ac_id" });
        activitiesCount++;
      }
    } catch (e) {
      await logError("notes", acDealId, e instanceof Error ? e.message : "Unknown", { dealId: acDealId });
    }
  }

  await service.from("ac_pipeline_selection").update({
    local_pipeline_id: localPipelineId,
    last_synced_at: new Date().toISOString(),
  }).eq("ac_pipeline_id", acPipelineId);

  return { stagesCount, dealsCount, contactsCount, activitiesCount };
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

    const results: any[] = [];
    let totals = { stagesCount: 0, dealsCount: 0, contactsCount: 0, activitiesCount: 0 };

    for (const sel of selected) {
      try {
        const r = await syncPipeline(sel.ac_pipeline_id, sel.ac_pipeline_title);
        results.push({ pipeline: sel.ac_pipeline_title, ...r });
        totals.stagesCount += r.stagesCount;
        totals.dealsCount += r.dealsCount;
        totals.contactsCount += r.contactsCount;
        totals.activitiesCount += r.activitiesCount;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        await logError("pipeline", sel.ac_pipeline_id, msg, sel);
        results.push({ pipeline: sel.ac_pipeline_title, error: msg });
      }
    }

    await service.from("integration_settings").update({
      sync_status: "idle",
      last_full_sync_at: new Date().toISOString(),
      sync_log: { results, totals, ranAt: new Date().toISOString() },
    }).neq("id", "00000000-0000-0000-0000-000000000000");

    return new Response(JSON.stringify({ ok: true, results, totals }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await service.from("integration_settings").update({ sync_status: "error" }).neq("id", "00000000-0000-0000-0000-000000000000");
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
