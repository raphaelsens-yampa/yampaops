import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin gate
    const { data: roleRow } = await service.from("user_roles")
      .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 1000);
    const useEmail = body?.use_email !== false;
    const usePhone = body?.use_phone !== false;
    const primaryEmailOnly = !!body?.primary_email_only;

    const { data: convs } = await service.from("chatwoot_conversations")
      .select("chatwoot_conversation_id")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    const ids = (convs || []).map((c: any) => Number(c.chatwoot_conversation_id));
    let matched = 0;
    let matchedByEmail = 0;
    let matchedByPhone = 0;
    let noMatch = 0;
    let failed = 0;
    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const id of ids) {
      try {
        const r = await fetch(`${projectUrl}/functions/v1/chatwoot-to-ac-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ conversation_id: id, use_email: useEmail, use_phone: usePhone, primary_email_only: primaryEmailOnly }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.ok) {
          matched++;
          if (j.match_method === "email") matchedByEmail++;
          else if (j.match_method === "phone") matchedByPhone++;
        } else if (j?.reason === "no_match") noMatch++;
        else failed++;
      } catch {
        failed++;
      }
      // throttle (~5 req/s)
      await new Promise((res) => setTimeout(res, 220));
    }


    return new Response(JSON.stringify({ ok: true, processed: ids.length, matched, no_match: noMatch, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
