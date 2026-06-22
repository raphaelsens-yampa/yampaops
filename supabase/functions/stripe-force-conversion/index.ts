// Grava manualmente uma conversão em stripe_conversions, com trilha em integration_sync_errors.
// Apenas admin.
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

  const email = String(body?.email || "").trim().toLowerCase();
  const area = String(body?.area || "desconhecida").trim();
  const mrr = Number(body?.mrr || 0);
  const subscription_id: string | null = body?.subscription_id || null;
  const customer_id: string | null = body?.customer_id || null;
  const price_id: string | null = body?.price_id || null;
  const plan_name: string | null = body?.plan_name || null;
  const product_name: string | null = body?.product_name || null;
  const note: string = body?.note || "";
  const registered_at: string | null = body?.registered_at || null;
  const converted_at: string = body?.converted_at || new Date().toISOString();

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "email inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!(mrr > 0)) {
    return new Response(JSON.stringify({ error: "MRR deve ser maior que zero" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let conversionId: string | null = null;

    if (subscription_id) {
      const { data: existing } = await supabase
        .from("stripe_conversions")
        .select("id")
        .eq("stripe_subscription_id", subscription_id)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase.from("stripe_conversions").update({
          customer_email: email,
          stripe_customer_id: customer_id,
          stripe_price_id: price_id,
          area, product_name, plan_name, mrr,
          registered_at, converted_at,
        }).eq("id", existing.id);
        if (error) throw error;
        conversionId = existing.id;
      } else {
        const { data, error } = await supabase.from("stripe_conversions").insert({
          stripe_event_id: `manual_${crypto.randomUUID()}`,
          stripe_subscription_id: subscription_id,
          stripe_customer_id: customer_id,
          stripe_price_id: price_id,
          customer_email: email,
          area, product_name, plan_name, mrr,
          registered_at, converted_at,
        }).select("id").single();
        if (error) throw error;
        conversionId = data.id;
      }
    } else {
      const { data, error } = await supabase.from("stripe_conversions").insert({
        stripe_event_id: `manual_${crypto.randomUUID()}`,
        stripe_customer_id: customer_id,
        stripe_price_id: price_id,
        customer_email: email,
        area, product_name, plan_name, mrr,
        registered_at, converted_at,
      }).select("id").single();
      if (error) throw error;
      conversionId = data.id;
    }

    // Marca unmapped_price como resolvido se aplicável
    if (price_id) {
      await supabase
        .from("integration_sync_errors")
        .update({ resolved: true })
        .eq("entity_type", "stripe_unmapped_price")
        .eq("ac_id", price_id)
        .eq("resolved", false);
    }

    // Trilha de auditoria
    await supabase.from("integration_sync_errors").insert({
      entity_type: "stripe_manual_force",
      ac_id: subscription_id || price_id || email,
      error_message: `Conversão forçada manualmente por ${userId}`,
      payload: {
        conversion_id: conversionId,
        email, area, mrr, plan_name, product_name,
        subscription_id, customer_id, price_id,
        registered_at, converted_at,
        forced_by: userId,
        note,
      },
      resolved: true,
    });

    return new Response(JSON.stringify({ ok: true, conversion_id: conversionId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Erro ao gravar" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
