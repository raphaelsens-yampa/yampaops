// Atualiza uma conversão existente em stripe_conversions, com trilha de auditoria. Apenas admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const conversion_id: string = body?.conversion_id;
  if (!conversion_id) {
    return new Response(JSON.stringify({ error: "conversion_id é obrigatório" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const note: string = String(body?.note || "").trim();
  if (!note) {
    return new Response(JSON.stringify({ error: "Justificativa (note) é obrigatória" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const editable = [
    "area", "mrr", "plan_name", "product_name", "converted_at", "registered_at",
    "conversion_type", "previous_mrr", "assigned_seller_id", "attribution_source",
  ] as const;
  const updates: Record<string, any> = {};
  for (const k of editable) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (updates.mrr !== undefined) {
    const n = Number(updates.mrr);
    if (!(n > 0)) {
      return new Response(JSON.stringify({ error: "MRR deve ser maior que zero" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    updates.mrr = n;
  }
  if (updates.previous_mrr !== undefined) {
    const n = Number(updates.previous_mrr);
    if (!(n >= 0)) {
      return new Response(JSON.stringify({ error: "previous_mrr deve ser >= 0" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    updates.previous_mrr = n;
  }
  if (updates.conversion_type !== undefined) {
    const allowed = ["new", "upsell", "downgrade", "renewal"];
    if (!allowed.includes(String(updates.conversion_type))) {
      return new Response(JSON.stringify({ error: "conversion_type inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  // Special action: re-run automatic seller resolution
  const resolveSeller: boolean = !!body?.resolve_seller;

  try {
  const { data: before, error: beforeErr } = await supabase
      .from("stripe_conversions")
      .select("id, area, mrr, plan_name, product_name, converted_at, registered_at, customer_email, stripe_subscription_id, stripe_price_id, stripe_customer_id, conversion_type, previous_mrr, assigned_seller_id, attribution_source")
      .eq("id", conversion_id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) {
      return new Response(JSON.stringify({ error: "Conversão não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If requested, run resolve_stripe_seller and fold into updates
    if (resolveSeller) {
      const { data: rs } = await supabase.rpc("resolve_stripe_seller", {
        p_customer_id: before.stripe_customer_id,
        p_email: before.customer_email,
        p_at: before.converted_at || new Date().toISOString(),
      });
      const row = Array.isArray(rs) ? rs[0] : rs;
      if (row) {
        updates.assigned_seller_id = row.seller_id ?? null;
        updates.attribution_source = row.source ?? null;
      }
    }
    if (!before) {
      return new Response(JSON.stringify({ error: "Conversão não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await supabase
        .from("stripe_conversions")
        .update(updates)
        .eq("id", conversion_id);
      if (updErr) throw updErr;
    }

    const diff: Record<string, { before: any; after: any }> = {};
    for (const k of Object.keys(updates)) {
      if ((before as any)[k] !== updates[k]) {
        diff[k] = { before: (before as any)[k], after: updates[k] };
      }
    }

    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_manual_edit",
      ac_id: conversion_id,
      error_message: `Conversão ${conversion_id} editada manualmente por ${userId}`,
      payload: {
        conversion_id,
        email: before.customer_email,
        subscription_id: before.stripe_subscription_id,
        price_id: before.stripe_price_id,
        edited_by: userId,
        note,
        diff,
      },
      resolved: true,
    });

    return new Response(JSON.stringify({ ok: true, conversion_id, diff }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Erro ao atualizar" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
