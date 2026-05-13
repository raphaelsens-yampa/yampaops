import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({ campaign_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { campaign_id } = parsed.data;

    // Aggregate from contacts
    const { data: rows } = await supabase
      .from("sales_campaign_contacts")
      .select("status, mrr_generated, matched_chatwoot_contact_id")
      .eq("campaign_id", campaign_id);

    let contacted = 0, replies = 0, meetings = 0, conversions = 0, mrr = 0;
    for (const r of rows || []) {
      if (r.matched_chatwoot_contact_id) contacted++;
      if (["respondeu", "agendado", "convertido"].includes(r.status)) replies++;
      if (["agendado", "convertido"].includes(r.status)) meetings++;
      if (r.status === "convertido") conversions++;
      mrr += Number(r.mrr_generated || 0);
    }

    return json({
      ok: true,
      preview: { contacted, replies, meetings, conversions, mrr_generated: mrr },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
