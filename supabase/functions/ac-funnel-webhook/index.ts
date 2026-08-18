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

/**
 * Webhook de deals do ActiveCampaign — somente leitura para métricas de funil.
 * Configure no AC apontando para esta URL com ?secret=<AC_WEBHOOK_SECRET>.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("AC_WEBHOOK_SECRET") ?? "";
    const provided = url.searchParams.get("secret") ?? req.headers.get("x-ac-signature") ?? "";
    if (!secret || provided !== secret) return json({ error: "unauthorized" }, 401);

    // AC envia form-urlencoded; aceitamos JSON também.
    let payload: Record<string, string> = {};
    const raw = await req.text();
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const parsed = JSON.parse(raw || "{}");
      const flatten = (obj: any, prefix = "") => {
        for (const [k, v] of Object.entries(obj ?? {})) {
          const key = prefix ? `${prefix}[${k}]` : k;
          if (v && typeof v === "object") flatten(v, key);
          else payload[key] = String(v ?? "");
        }
      };
      flatten(parsed);
    } else {
      for (const [k, v] of new URLSearchParams(raw).entries()) payload[k] = v;
    }

    const dealId = payload["deal[id]"] ?? payload["deal_id"] ?? payload["id"] ?? "";
    if (!dealId) return json({ ok: true, ignored: "sem deal id" });

    if (!AC_API_URL || !AC_API_KEY) return json({ error: "AC_API_URL/AC_API_KEY não configurados" }, 500);

    // Busca o deal na API (fonte autoritativa) e ignora se o funil não está conectado.
    const dealResp = await acFetch(`deals/${encodeURIComponent(dealId)}`);
    const d = dealResp.deal;
    if (!d) return json({ ok: true, ignored: "deal não encontrado" });

    const groupId = String(d.group ?? "");
    const db = admin();
    const { data: funnel } = await db
      .from("ac_funnels")
      .select("ac_group_id, is_connected")
      .eq("ac_group_id", groupId)
      .maybeSingle();
    if (!funnel?.is_connected) return json({ ok: true, ignored: "funil não conectado" });

    let contact: any = null;
    if (d.contact) {
      try {
        contact = (await acFetch(`contacts/${encodeURIComponent(String(d.contact))}`)).contact ?? null;
      } catch (e) {
        console.error("contact fetch failed:", (e as Error).message);
      }
    }

    const { data: prevRow } = await db
      .from("ac_funnel_deals")
      .select("ac_deal_id, ac_group_id, ac_stage_id, status, value, contact_email, owner_name")
      .eq("ac_deal_id", String(d.id))
      .maybeSingle();
    const prev = (prevRow ?? null) as StoredDeal | null;

    const nowIso = new Date().toISOString();
    const next = {
      ac_deal_id: String(d.id),
      ac_group_id: groupId,
      ac_stage_id: d.stage ? String(d.stage) : null,
      status: num(d.status),
      value: num(d.value) / 100,
      contact_email: contact?.email ? String(contact.email).toLowerCase() : (prev?.contact_email ?? null),
      owner_name: prev?.owner_name ?? null,
      deal_created_at: iso(d.cdate),
      occurred_at: nowIso,
    };

    const events = await writeEvents(db, prev, next, "webhook");
    const stageChanged = prev ? (prev.ac_stage_id ?? "") !== (next.ac_stage_id ?? "") : true;

    const row: Record<string, unknown> = {
      ac_deal_id: next.ac_deal_id,
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
      deal_updated_at: iso(d.mdate) ?? nowIso,
      closed_at: next.status === 1 || next.status === 2 ? nowIso : null,
    };
    if (stageChanged) row.stage_changed_at = nowIso;

    const { error } = await db.from("ac_funnel_deals").upsert(row, { onConflict: "ac_deal_id" });
    if (error) {
      console.error("deal upsert failed:", error.message);
      return json({ error: error.message }, 500);
    }

    await db.from("ac_funnels").update({ last_webhook_at: nowIso }).eq("ac_group_id", groupId);

    return json({ ok: true, deal_id: next.ac_deal_id, events, type: payload["type"] ?? null });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("ac-funnel-webhook error:", msg);
    return json({ error: msg }, 500);
  }
});
