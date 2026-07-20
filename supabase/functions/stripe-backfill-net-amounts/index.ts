// Backfill de valores líquidos (com desconto de cupom) em stripe_conversions.
// Para cada conversão no range, busca a invoice paga correspondente no Stripe e
// hidrata: gross_amount, net_amount, discount_amount, mrr_net, coupon_*, promotion_code,
// discount_duration, discount_duration_in_months, stripe_invoice_id, net_amount_source.
// Não altera mrr; comissões já lançadas não são recalculadas aqui (o trigger em
// mrr_net cuida disso pra conversões que ainda não geraram commission_conversions).
// Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (!stripeKey) return ok({ error: "STRIPE_SECRET_KEY missing" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return ok({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return ok({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return ok({ error: "forbidden" }, 403);

  const supabase = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let from: string | null = null;
  let to: string | null = null;
  let limit = 500;
  let onlyMissing = true;
  let idsFilter: string[] | null = null;
  try {
    const body = await req.json();
    if (body?.from) from = String(body.from);
    if (body?.to) to = String(body.to);
    if (body?.limit) limit = Math.max(1, Math.min(2000, Number(body.limit)));
    if (typeof body?.only_missing === "boolean") onlyMissing = body.only_missing;
    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      idsFilter = body.ids.map((s: any) => String(s)).slice(0, 500);
      // Quando o caller pede por IDs específicos, ignora only_missing
      onlyMissing = false;
    }
  } catch {}

  let q = supabase
    .from("stripe_conversions")
    .select("id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_invoice_id, converted_at, net_amount")
    .not("converted_at", "is", null)
    .order("converted_at", { ascending: true })
    .limit(limit);
  if (idsFilter) {
    q = q.in("id", idsFilter);
  } else {
    if (from) q = q.gte("converted_at", from);
    if (to) q = q.lte("converted_at", to);
    if (onlyMissing) q = q.is("net_amount", null);
  }

  const { data: rows, error } = await q;
  if (error) return ok({ error: error.message }, 500);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    scanned++;
    try {
      let invoiceId: string | null = row.stripe_invoice_id ?? null;

      // Se não tem invoice_id, tenta achar a paga mais próxima do converted_at
      if (!invoiceId) {
        if (row.stripe_subscription_id) {
          const inv = await stripe.invoices.list({
            subscription: row.stripe_subscription_id,
            status: "paid",
            limit: 10,
          });
          const convTs = row.converted_at ? new Date(row.converted_at).getTime() : 0;
          let best: any = null;
          let bestDelta = Infinity;
          for (const i of inv.data) {
            const ts = ((i.status_transitions?.paid_at ?? i.created) as number) * 1000;
            const delta = Math.abs(ts - convTs);
            if (delta < bestDelta) { bestDelta = delta; best = i; }
          }
          invoiceId = best?.id ?? null;
        } else if (row.stripe_customer_id) {
          const inv = await stripe.invoices.list({
            customer: row.stripe_customer_id,
            status: "paid",
            limit: 20,
          });
          const convTs = row.converted_at ? new Date(row.converted_at).getTime() : 0;
          let best: any = null;
          let bestDelta = Infinity;
          for (const i of inv.data) {
            // exige que a linha bata com o price da conversão, se houver
            if (row.stripe_price_id) {
              const hasLine = (i.lines?.data ?? []).some((l: any) => l?.price?.id === row.stripe_price_id);
              if (!hasLine) continue;
            }
            const ts = ((i.status_transitions?.paid_at ?? i.created) as number) * 1000;
            const delta = Math.abs(ts - convTs);
            if (delta < bestDelta) { bestDelta = delta; best = i; }
          }
          invoiceId = best?.id ?? null;
        }
      }

      if (!invoiceId) { skipped++; continue; }

      const invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ["discounts", "lines.data.discounts", "total_discount_amounts.discount"],
      });

      const grossAmount = (invoice.subtotal ?? 0) / 100;
      const netAmount = (invoice.amount_paid ?? invoice.total ?? 0) / 100;
      const totalDiscCents = (invoice.total_discount_amounts ?? [])
        .reduce((s: number, d: any) => s + Number(d?.amount || 0), 0);
      const discountAmount = totalDiscCents / 100;

      let couponId: string | null = null;
      let couponName: string | null = null;
      let couponPercentOff: number | null = null;
      let couponAmountOff: number | null = null;
      let promotionCode: string | null = null;
      let discountDuration: string | null = null;
      let discountDurationInMonths: number | null = null;

      const discounts: any[] = (invoice as any).discounts ?? [];
      const firstDisc = discounts[0];
      if (firstDisc && typeof firstDisc === "object") {
        const coupon = firstDisc.coupon;
        if (coupon) {
          couponId = coupon.id ?? null;
          couponName = coupon.name ?? null;
          couponPercentOff = coupon.percent_off ?? null;
          couponAmountOff = coupon.amount_off != null ? coupon.amount_off / 100 : null;
          discountDuration = coupon.duration ?? null;
          discountDurationInMonths = coupon.duration_in_months ?? null;
        }
        if (firstDisc.promotion_code) {
          const pc = firstDisc.promotion_code;
          promotionCode = typeof pc === "string" ? pc : (pc?.code ?? pc?.id ?? null);
        }
      }

      let mrrNet: number | null = null;
      if (row.stripe_price_id) {
        const line = (invoice.lines?.data ?? []).find((l: any) => l?.price?.id === row.stripe_price_id) as any;
        if (line) {
          const lineGrossCents = Number(line.amount ?? 0);
          const lineDiscCents = (line.discount_amounts ?? [])
            .reduce((s: number, d: any) => s + Number(d?.amount || 0), 0);
          const netCents = Math.max(0, lineGrossCents - lineDiscCents);
          const netValue = netCents / 100;
          const interval = line.price?.recurring?.interval;
          const count = line.price?.recurring?.interval_count || 1;
          if (interval) {
            switch (interval) {
              case "month": mrrNet = netValue / count; break;
              case "year":  mrrNet = netValue / (12 * count); break;
              case "week":  mrrNet = (netValue * 4.345) / count; break;
              case "day":   mrrNet = (netValue * 30) / count; break;
            }
          } else if (netValue > 0) {
            mrrNet = netValue;
          }
        }
      }

      const { error: updErr } = await supabase.from("stripe_conversions").update({
        gross_amount: grossAmount,
        net_amount: netAmount,
        discount_amount: discountAmount,
        mrr_net: mrrNet,
        coupon_id: couponId,
        coupon_name: couponName,
        coupon_percent_off: couponPercentOff,
        coupon_amount_off: couponAmountOff,
        promotion_code: promotionCode,
        discount_duration: discountDuration,
        discount_duration_in_months: discountDurationInMonths,
        stripe_invoice_id: invoice.id,
        net_amount_source: "invoice",
      }).eq("id", row.id);

      if (updErr) { failed++; errors.push(`${row.id}: ${updErr.message}`); }
      else updated++;
    } catch (e: any) {
      failed++;
      errors.push(`${row.id}: ${e?.message || String(e)}`);
    }
  }

  return ok({
    ok: true,
    scanned,
    updated,
    skipped_no_invoice: skipped,
    failed,
    errors: errors.slice(0, 20),
  });
});
