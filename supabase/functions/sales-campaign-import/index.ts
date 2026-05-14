import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const toStr = z.preprocess(
  (v) => (v === null || v === undefined || v === "" ? null : String(v)),
  z.string().nullable(),
).optional();

const RowSchema = z.object({
  name: toStr,
  email: toStr,
  phone: toStr,
  company: toStr,
  extra: z.record(z.any()).optional(),
});

const BodySchema = z.object({
  campaign_id: z.string().uuid(),
  file_name: z.string().optional(),
  mapping: z.record(z.any()).default({}),
  rows: z.array(RowSchema).min(1).max(20000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { campaign_id, file_name, mapping, rows } = parsed.data;

    // Insert import record
    const { data: imp, error: impErr } = await supabase
      .from("sales_campaign_imports")
      .insert({
        campaign_id,
        file_name,
        mapping,
        total_rows: rows.length,
        status: "processing",
        created_by: user.id,
      })
      .select()
      .single();
    if (impErr) return json({ error: impErr.message }, 500);

    // Dedupe within batch by email/phone
    const seen = new Set<string>();
    const toInsert = rows
      .map((r) => {
        const email = r.email?.trim().toLowerCase() || null;
        const phone = r.phone || null;
        const key = `${email || ""}|${phone || ""}`;
        if (key !== "|" && seen.has(key)) return null;
        seen.add(key);
        return {
          campaign_id,
          name: r.name || null,
          email,
          phone,
          company: r.company || null,
          extra: r.extra || {},
        };
      })
      .filter(Boolean);

    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const chunk = toInsert.slice(i, i + batchSize);
      const { error } = await supabase.from("sales_campaign_contacts").insert(chunk as any);
      if (error) {
        await supabase
          .from("sales_campaign_imports")
          .update({ status: "error", error_message: error.message, inserted_rows: inserted })
          .eq("id", imp.id);
        return json({ error: error.message, inserted }, 500);
      }
      inserted += chunk.length;
    }

    await supabase
      .from("sales_campaign_imports")
      .update({
        status: "completed",
        inserted_rows: inserted,
        skipped_rows: rows.length - inserted,
      })
      .eq("id", imp.id);

    return json({ ok: true, import_id: imp.id, inserted, skipped: rows.length - inserted });
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
