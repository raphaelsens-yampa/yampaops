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

    // Fetch contacts in batches
    const PAGE = 1000;
    let from = 0;
    let totalMatched = 0;
    let totalConverted = 0;
    let totalMrr = 0;

    while (true) {
      const { data: contacts, error } = await supabase
        .from("sales_campaign_contacts")
        .select("id, email_norm, phone_digits")
        .eq("campaign_id", campaign_id)
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message }, 500);
      if (!contacts || contacts.length === 0) break;

      const emails = [...new Set(contacts.map((c) => c.email_norm).filter(Boolean) as string[])];
      const phones = [...new Set(contacts.map((c) => c.phone_digits).filter(Boolean) as string[])];

      // Chatwoot contacts
      const cwByEmail = new Map<string, any>();
      const cwByPhone = new Map<string, any>();
      if (emails.length || phones.length) {
        const orParts: string[] = [];
        if (emails.length) orParts.push(`email.in.(${emails.map((e) => `"${e}"`).join(",")})`);
        if (phones.length) orParts.push(`phone_digits.in.(${phones.map((p) => `"${p}"`).join(",")})`);
        const { data: cw } = await supabase
          .from("chatwoot_contacts")
          .select("chatwoot_contact_id, email, phone_digits, additional_emails, additional_phones")
          .or(orParts.join(","));
        for (const c of cw || []) {
          if (c.email) cwByEmail.set(c.email, c);
          for (const e of c.additional_emails || []) cwByEmail.set(String(e).toLowerCase(), c);
          if (c.phone_digits) cwByPhone.set(c.phone_digits, c);
          for (const p of c.additional_phones || []) {
            const d = String(p).replace(/\D+/g, "");
            if (d) cwByPhone.set(d.length > 11 ? d.slice(-11) : d, c);
          }
        }
      }

      // Stripe conversions
      const stripeByEmail = new Map<string, any>();
      if (emails.length) {
        const { data: sc } = await supabase
          .from("stripe_conversions")
          .select("matched_opportunity_id, customer_email, mrr")
          .in("customer_email", emails);
        for (const s of sc || []) {
          if (s.customer_email) stripeByEmail.set(s.customer_email.toLowerCase(), s);
        }
      }

      // Internal contacts
      const intByEmail = new Map<string, any>();
      if (emails.length) {
        const { data: ic } = await supabase
          .from("contacts")
          .select("id, email")
          .in("email", emails);
        for (const c of ic || []) {
          if (c.email) intByEmail.set(c.email.toLowerCase(), c);
        }
      }

      // Build updates
      const updates: any[] = [];
      for (const c of contacts) {
        const cw = (c.email_norm && cwByEmail.get(c.email_norm)) || (c.phone_digits && cwByPhone.get(c.phone_digits));
        const stripe = c.email_norm && stripeByEmail.get(c.email_norm);
        const internal = c.email_norm && intByEmail.get(c.email_norm);
        const update: any = { id: c.id };
        let touched = false;
        if (cw) {
          update.matched_chatwoot_contact_id = cw.chatwoot_contact_id;
          update.match_method = c.email_norm && cwByEmail.get(c.email_norm) ? "email" : "phone";
          touched = true;
          totalMatched++;
        }
        if (stripe) {
          update.matched_opportunity_id = stripe.matched_opportunity_id || null;
          update.mrr_generated = Number(stripe.mrr || 0);
          update.status = "convertido";
          totalConverted++;
          totalMrr += Number(stripe.mrr || 0);
          touched = true;
        }
        if (internal) {
          update.matched_contact_id = internal.id;
          touched = true;
        }
        if (touched) updates.push(update);
      }

      // Apply updates one-by-one (small batches preferred but PostgREST has no bulk-update with different values)
      for (const u of updates) {
        const { id, ...rest } = u;
        await supabase.from("sales_campaign_contacts").update(rest).eq("id", id);
      }

      if (contacts.length < PAGE) break;
      from += PAGE;
    }

    return json({ ok: true, matched: totalMatched, converted: totalConverted, mrr: totalMrr });
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
