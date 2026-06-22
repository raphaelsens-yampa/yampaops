// Diagnostica por que emails informados não aparecem em stripe_conversions.
// Para cada email: consulta tabela local, depois busca na Stripe (customers + subscriptions),
// resolve Mapa de Preços e classifica o motivo. Apenas admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Finding = {
  status:
    | "already_counted"
    | "unmapped_price"
    | "zero_mrr"
    | "no_paid_invoice"
    | "discarded_other"
    | "not_in_stripe"
    | "no_subscription"
    | "error";
  reason: string;
  subscription_id?: string | null;
  customer_id?: string | null;
  price_id?: string | null;
  product_name?: string | null;
  plan_name?: string | null;
  area?: string | null;
  mrr?: number;
  registered_at?: string | null;
  converted_at?: string | null;
  conversion_id?: string | null;
  sub_status?: string | null;
};

type EmailResult = {
  email: string;
  findings: Finding[];
};

function computeMrr(priceObj: Stripe.Price | null | undefined): number {
  if (!priceObj) return 0;
  const amount = (priceObj.unit_amount ?? 0) / 100;
  const interval = priceObj.recurring?.interval;
  const count = priceObj.recurring?.interval_count || 1;
  if (amount <= 0 || !interval) return 0;
  switch (interval) {
    case "month": return amount / count;
    case "year": return amount / (12 * count);
    case "week": return (amount * 4.345) / count;
    case "day": return (amount * 30) / count;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
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

  let emails: string[] = [];
  try {
    const body = await req.json();
    emails = Array.isArray(body?.emails) ? body.emails : [];
  } catch {}
  emails = Array.from(new Set(
    emails.map((e) => String(e || "").trim().toLowerCase()).filter((e) => e.includes("@")),
  )).slice(0, 100);

  if (emails.length === 0) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const results: EmailResult[] = [];

  for (const email of emails) {
    const findings: Finding[] = [];

    try {
      // 1) Local check
      const { data: existing } = await supabase
        .from("stripe_conversions")
        .select("id, area, product_name, plan_name, mrr, converted_at, registered_at, stripe_subscription_id, stripe_price_id, stripe_customer_id")
        .eq("customer_email", email)
        .order("converted_at", { ascending: false, nullsFirst: false });

      const counted = (existing || []).filter((r: any) => r.converted_at && Number(r.mrr) > 0);
      if (counted.length > 0) {
        for (const r of counted) {
          findings.push({
            status: "already_counted",
            reason: "Já está contabilizada em Conversões.",
            conversion_id: r.id,
            subscription_id: r.stripe_subscription_id,
            customer_id: r.stripe_customer_id,
            price_id: r.stripe_price_id,
            product_name: r.product_name,
            plan_name: r.plan_name,
            area: r.area,
            mrr: Number(r.mrr || 0),
            converted_at: r.converted_at,
            registered_at: r.registered_at,
          });
        }
        results.push({ email, findings });
        continue;
      }

      // 2) Stripe lookup
      let customers: Stripe.Customer[] = [];
      try {
        const search = await stripe.customers.search({ query: `email:"${email}"`, limit: 10 });
        customers = search.data;
      } catch {
        const list = await stripe.customers.list({ email, limit: 10 });
        customers = list.data;
      }

      if (customers.length === 0) {
        findings.push({
          status: "not_in_stripe",
          reason: "Email não encontrado como customer na Stripe.",
        });
        results.push({ email, findings });
        continue;
      }

      let hasAnySub = false;
      for (const c of customers) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 });
        for (const sub of subs.data) {
          hasAnySub = true;
          const priceObj = sub.items?.data?.[0]?.price || null;
          const priceId = priceObj?.id || null;

          // Mapa de Preços
          let area: string | null = "desconhecida";
          let productName: string | null = null;
          let planName: string | null = null;
          let priceMapped = false;
          let mrr = 0;

          if (priceId) {
            const { data: pm } = await supabase
              .from("commission_price_map")
              .select("area, offer_name, plan_name, price_name, mrr_override")
              .eq("price_id", priceId)
              .maybeSingle();
            if (pm) {
              priceMapped = true;
              area = pm.area || "desconhecida";
              productName = pm.offer_name || null;
              planName = pm.plan_name || pm.price_name || null;
              if (pm.mrr_override != null) mrr = Number(pm.mrr_override);
            }
          }
          if (mrr <= 0) mrr = computeMrr(priceObj);

          // Verifica se houve invoice paga
          const paid = await stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 1 });
          const hasPaid = paid.data.length > 0;

          let status: Finding["status"];
          let reason: string;
          if (mrr <= 0) {
            status = "zero_mrr";
            reason = priceId
              ? "Assinatura com MRR zerado (preço sem valor recorrente)."
              : "Assinatura sem price_id na Stripe.";
          } else if (priceId && !priceMapped) {
            status = "unmapped_price";
            reason = `price_id ${priceId} não está no Mapa de Preços — conversão não foi atribuída.`;
          } else if (!hasPaid) {
            status = "no_paid_invoice";
            reason = `Assinatura sem nenhuma invoice paga (status: ${sub.status}).`;
          } else {
            status = "discarded_other";
            reason = `Assinatura existe mas não gerou conversão (status: ${sub.status}).`;
          }

          findings.push({
            status,
            reason,
            subscription_id: sub.id,
            customer_id: c.id,
            price_id: priceId,
            product_name: productName,
            plan_name: planName,
            area,
            mrr,
            sub_status: sub.status,
            registered_at: c.created ? new Date(c.created * 1000).toISOString() : null,
          });
        }
      }

      if (!hasAnySub) {
        findings.push({
          status: "no_subscription",
          reason: "Customer existe na Stripe mas não tem nenhuma assinatura.",
          customer_id: customers[0].id,
        });
      }

      results.push({ email, findings });
    } catch (e: any) {
      results.push({
        email,
        findings: [{ status: "error", reason: e?.message || "Erro inesperado" }],
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
