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

    // Normalize phone to digits (last 11 if BR), matching SQL normalize_phone_digits
    const normPhone = (p?: string | null) => {
      if (!p) return null;
      const d = String(p).replace(/\D+/g, "");
      if (d.length < 8) return null;
      return d.length > 11 ? d.slice(-11) : d;
    };
    const normEmail = (e?: string | null) => {
      const v = e?.trim().toLowerCase() || null;
      return v && v !== "" ? v : null;
    };

    // Fetch existing contacts in this campaign to dedupe incrementally
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("sales_campaign_contacts")
          .select("email_norm, phone_digits")
          .eq("campaign_id", campaign_id)
          .range(from, from + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        for (const r of data) {
          if (r.email_norm) existingEmails.add(r.email_norm);
          if (r.phone_digits) existingPhones.add(r.phone_digits);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Dedupe within batch AND against existing contacts (by email or phone)
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    let duplicatesSkipped = 0;
    const toInsert = rows
      .map((r) => {
        const email = normEmail(r.email);
        const phone_digits = normPhone(r.phone);

        // Skip if matches existing contact in campaign
        if ((email && existingEmails.has(email)) || (phone_digits && existingPhones.has(phone_digits))) {
          duplicatesSkipped++;
          return null;
        }
        // Skip if duplicated within current batch
        if ((email && seenEmail.has(email)) || (phone_digits && seenPhone.has(phone_digits))) {
          duplicatesSkipped++;
          return null;
        }
        if (email) seenEmail.add(email);
        if (phone_digits) seenPhone.add(phone_digits);

        return {
          campaign_id,
          name: r.name || null,
          email,
          phone: r.phone || null,
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
