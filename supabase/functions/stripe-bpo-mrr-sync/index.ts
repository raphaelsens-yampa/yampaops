// Confere diariamente na Stripe as assinaturas dos produtos BPO/Consultoria e
// completa a base de ativos pagantes do dia (metas_ativos_pagantes_daily) quando
// o Metabase não traz o cliente ou traz MRR menor. Atualiza os totais do dia
// (metas_snapshot_diario) e do mês (metabase_monthly_agg). Idempotente: refaz
// as linhas de ajuste do dia e usa stripe_bpo_mrr_runs para não somar duas vezes.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PRODUCTS = new Set([
  "prod_TPBV0GlblicAQc", // BPO Júnior
  "prod_Uvz07Q0TWz9vJW", // BPO Júnior (Sales yampa)
  "prod_TnROE4yTn6XP4L", // BPO Pleno
  "prod_Trv8AC81QZ0Ur9", // BPO Sênior
  "prod_Unisy5War7s19p",
]);
// Contam como ativos mesmo com pagamento pendente (decisão do negócio).
const STATUSES = ["active", "past_due", "unpaid", "paused"] as const;
const STATUS_LABEL: Record<string, string> = { active: "Em dia", past_due: "Atrasada", unpaid: "Não paga", paused: "Pausada" };
const FREE = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "icloud.com", "live.com", "bol.com.br", "uol.com.br", "terra.com.br", "msn.com", "me.com"]);
const FONTE = "Stripe BPO (conferência diária)";
const r2 = (n: number) => Math.round(n * 100) / 100;

function spToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
/** Chave alternativa para achar o mesmo cliente com outro e-mail (ex.: fulano@gmail ↔ x@fulano.com.br). */
function aliasKey(email: string): string | null {
  const [local, domain] = email.split("@");
  if (!domain) return null;
  const k = FREE.has(domain) ? local : domain.split(".")[0];
  return k && k.length >= 6 ? k.replace(/[^a-z0-9]/g, "") : null;
}
function monthly(price: Stripe.Price, qty: number): number {
  const amt = (price.unit_amount ?? 0) / 100 * (qty || 1);
  const iv = price.recurring?.interval ?? "month";
  const c = price.recurring?.interval_count ?? 1;
  const perMonth = iv === "year" ? amt / 12 : iv === "week" ? amt * 52 / 12 : iv === "day" ? amt * 30 : amt;
  return perMonth / c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (authenticateCronRequest(req) !== null) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data } = await supabase.auth.getClaims(token);
    const uid = data?.claims?.sub;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await supabase.rpc("is_internal_user", { _user_id: uid });
    if (!ok) return json({ error: "forbidden" }, 403);
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const dryRun = body?.dry_run === true;
  const date = dryRun && /^\d{4}-\d{2}-\d{2}$/.test(body?.date ?? "") ? body.date : spToday();

  try {
    // 1) Assinaturas Stripe dos produtos BPO
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const byEmail = new Map<string, { mrr: number; status: string; price: string; nome: string; product: string }>();
    // Lista só as assinaturas dos preços BPO (varrer a conta inteira estourava o tempo limite).
    const priceIds: string[] = [];
    for (const product of PRODUCTS) {
      for await (const pr of stripe.prices.list({ product, limit: 100 })) priceIds.push(pr.id);
    }
    const seenSubs = new Set<string>();
    for (const status of STATUSES) for (const price of priceIds) {
      for await (const sub of stripe.subscriptions.list({ status, price, limit: 100, expand: ["data.customer"] })) {
        if (seenSubs.has(sub.id)) continue;
        seenSubs.add(sub.id);
        const cust = sub.customer as Stripe.Customer;
        const email = (cust?.email || "").trim().toLowerCase();
        if (!email) continue;
        for (const it of sub.items.data) {
          const prod = typeof it.price.product === "string" ? it.price.product : it.price.product?.id;
          if (!prod || !PRODUCTS.has(prod)) continue;
          const cur = byEmail.get(email) ?? { mrr: 0, status, price: it.price.id, nome: it.price.nickname || "BPO", product: prod };
          cur.mrr = r2(cur.mrr + monthly(it.price, it.quantity ?? 1));
          if (status === "active") cur.status = "active";
          byEmail.set(email, cur);
        }
      }
    }

    // 1b) Vindi (novo gateway desde 23/11): assinaturas ativas na Vindi com venda paga
    //     registrada pelo vindi-sync. Regra própria: vale o MAIOR valor (base x Vindi),
    //     pois quem migrou da Stripe pode já estar na base.
    const vindiByEmail = new Map<string, { mrr: number; price: string; nome: string }>();
    const vkey = Deno.env.get("VINDI_API_KEY")?.trim();
    if (vkey) {
      const activeIds = new Set<string>();
      for (let page = 1; page < 200; page++) {
        const r = await fetch(`https://app.vindi.com.br/api/v1/subscriptions?per_page=50&page=${page}&query=${encodeURIComponent("status=active")}`,
          { headers: { Authorization: "Basic " + btoa(`${vkey}:`) } });
        if (!r.ok) throw new Error(`Vindi ${r.status}`);
        const items = (await r.json())?.subscriptions ?? [];
        for (const it of items) activeIds.add(`vindi_sub_${it.id}`);
        if (items.length < 50) break;
      }
      const { data: vc, error: ve } = await supabase.from("stripe_conversions")
        .select("stripe_subscription_id, customer_email, mrr, mrr_net, stripe_price_id, plan_name")
        .like("stripe_subscription_id", "vindi_%").eq("payment_status", "paid");
      if (ve) throw new Error(ve.message);
      for (const c of vc ?? []) {
        const email = (c.customer_email || "").trim().toLowerCase();
        if (!email || !activeIds.has(c.stripe_subscription_id)) continue;
        const cur = vindiByEmail.get(email) ?? { mrr: 0, price: c.stripe_price_id, nome: c.plan_name || "Vindi" };
        cur.mrr = r2(cur.mrr + Number(c.mrr_net ?? c.mrr ?? 0));
        vindiByEmail.set(email, cur);
      }
    }

    // 2) Base do dia vinda do Metabase (sem linhas de ajuste)
    const rows: { email: string | null; mrr: number | null; company_id: string; fonte: string | null }[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase.from("metas_ativos_pagantes_daily")
        .select("email, mrr, company_id, fonte").eq("data_snapshot", date).eq("status_assinatura", "ativo")
        .order("id").range(off, off + 999);
      if (error) throw new Error(`leitura base: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const isAdj = (r: { company_id: string; fonte: string | null }) =>
      r.company_id.startsWith("stripe-bpo-") || (r.fonte ?? "").startsWith("Ajuste manual planilha");
    const base = rows.filter((r) => !isAdj(r));
    if (base.length === 0) return json({ date, skipped: "Base do Metabase do dia ainda não chegou; nada alterado." });
    const mrrByEmail = new Map<string, number>();
    const mrrByAlias = new Map<string, number>();
    for (const r of base) {
      const e = (r.email || "").trim().toLowerCase();
      if (!e) continue;
      mrrByEmail.set(e, (mrrByEmail.get(e) ?? 0) + Number(r.mrr || 0));
      const a = aliasKey(e);
      if (a) mrrByAlias.set(a, (mrrByAlias.get(a) ?? 0) + Number(r.mrr || 0));
    }

    // 3) Ajustes: inclui quem falta, completa quem está menor
    const details: any[] = [];
    const inserts: any[] = [];
    let addedMrr = 0, addedAtivos = 0;
    const [y, m] = date.split("-");
    for (const [email, s] of byEmail) {
      let existing = mrrByEmail.get(email);
      let via = "email";
      if (existing === undefined) { const a = aliasKey(email); if (a && mrrByAlias.has(a)) { existing = mrrByAlias.get(a)!; via = "alias"; } }
      const isNew = existing === undefined;
      // Regra: base >= Stripe mantém; base < Stripe soma o valor Stripe inteiro; ausente entra com o valor Stripe.
      if (!isNew && existing! >= s.mrr) continue;
      const diff = r2(s.mrr);
      details.push({ email, stripe_mrr: s.mrr, base_mrr: existing ?? 0, added: diff, novo: isNew, via, status: s.status });
      addedMrr = r2(addedMrr + diff);
      if (isNew) addedAtivos++;
      inserts.push({
        data_snapshot: date, data_execucao: date, mes_ref: `${m}/${y}`, company_id: `stripe-bpo-${email}`, email,
        status_assinatura: "ativo", plano: "BPO", nome_oferta: s.nome, stripe_price_id: s.price, mrr: diff,
        origem_cliente: "yampa", status_pagamento: STATUS_LABEL[s.status] ?? s.status, gateway: "stripe",
        recorrencia_pagamento: "30", fonte: FONTE, tipo_snapshot: "diario",
        classificacao_company: isNew ? null : "complemento BPO",
      });
    }

    for (const [email, v] of vindiByEmail) {
      let existing = mrrByEmail.get(email);
      if (existing === undefined) { const a = aliasKey(email); if (a && mrrByAlias.has(a)) existing = mrrByAlias.get(a)!; }
      const isNew = existing === undefined;
      const diff = r2(v.mrr - (existing ?? 0));
      if (diff <= 0) continue;
      details.push({ email, vindi_mrr: v.mrr, base_mrr: existing ?? 0, added: diff, novo: isNew, via: "vindi" });
      addedMrr = r2(addedMrr + diff);
      if (isNew) addedAtivos++;
      inserts.push({
        data_snapshot: date, data_execucao: date, mes_ref: `${m}/${y}`, company_id: `stripe-bpo-vindi-${email}`, email,
        status_assinatura: "ativo", plano: v.nome, nome_oferta: v.nome, stripe_price_id: v.price, mrr: diff,
        origem_cliente: "yampa", status_pagamento: "Em dia", gateway: "vindi",
        recorrencia_pagamento: "30", fonte: "Vindi (conferência diária)", tipo_snapshot: "diario",
        classificacao_company: isNew ? null : "complemento Vindi",
      });
    }

    // 4) Totais do dia, sem somar duas vezes
    const { data: snap, error: se } = await supabase.from("metas_snapshot_diario")
      .select("id, metric_key, realized_amount, origem_cliente").eq("data", date).in("metric_key", ["total_mrr", "ativos_pagantes"]);
    if (se) throw new Error(se.message);
    const geral = (snap ?? []).filter((r) => !r.origem_cliente);
    const curMrr = Number(geral.find((r) => r.metric_key === "total_mrr")?.realized_amount ?? NaN);
    const curAt = Number(geral.find((r) => r.metric_key === "ativos_pagantes")?.realized_amount ?? NaN);
    if (!Number.isFinite(curMrr) || !Number.isFinite(curAt)) return json({ date, skipped: "Totais oficiais do dia ainda não chegaram; nada alterado." });
    const { data: run } = await supabase.from("stripe_bpo_mrr_runs").select("*").eq("data", date).maybeSingle();
    const untouched = run && r2(Number(run.written_mrr)) === r2(curMrr) && Number(run.written_ativos) === curAt;
    const baseMrr = untouched ? Number(run!.base_mrr) : curMrr;
    const baseAt = untouched ? Number(run!.base_ativos) : curAt;
    const newMrr = r2(baseMrr + addedMrr);
    const newAt = baseAt + addedAtivos;
    const result = { date, dry_run: dryRun, stripe_clientes: byEmail.size, ajustes: details.length, added_mrr: addedMrr, added_ativos: addedAtivos, oficial: { mrr: baseMrr, ativos: baseAt }, final: { mrr: newMrr, ativos: newAt }, details };
    console.log("bpo-sync", JSON.stringify(result));
    if (dryRun) return json(result);

    const { error: de1 } = await supabase.from("metas_ativos_pagantes_daily").delete().eq("data_snapshot", date).like("company_id", "stripe-bpo-%");
    if (de1) throw new Error(de1.message);
    const { error: de2 } = await supabase.from("metas_ativos_pagantes_daily").delete().eq("data_snapshot", date).like("fonte", "Ajuste manual planilha%");
    if (de2) throw new Error(de2.message);
    if (inserts.length) {
      const { error } = await supabase.from("metas_ativos_pagantes_daily").insert(inserts);
      if (error) throw new Error(`gravar ajustes: ${error.message}`);
    }
    for (const r of geral) {
      const v = r.metric_key === "total_mrr" ? newMrr : newAt;
      await supabase.from("metas_snapshot_diario").update({ realized_amount: v, deals_count: newAt }).eq("id", r.id);
    }
    await supabase.from("metabase_monthly_agg").update({ realized_amount: newMrr, deals_count: newAt })
      .eq("year_month", `${y}-${m}-01`).eq("metric_key", "total_mrr").is("origem_cliente", null);
    await supabase.from("metabase_monthly_agg").update({ realized_amount: newAt, deals_count: newAt })
      .eq("year_month", `${y}-${m}-01`).eq("metric_key", "ativos_pagantes").is("origem_cliente", null);
    await supabase.from("stripe_bpo_mrr_runs").upsert({
      data: date, base_mrr: baseMrr, base_ativos: baseAt, added_mrr: addedMrr, added_ativos: addedAtivos,
      written_mrr: newMrr, written_ativos: newAt, details, ran_at: new Date().toISOString(),
    });
    return json(result);
  } catch (e) {
    console.error("stripe-bpo-mrr-sync", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
