import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { authenticateCronRequest } from '../_shared/cron-auth.ts'

/**
 * vindi-sync — novo gateway (vendas desde 23/11/2026).
 * Lê assinaturas da Vindi (fonte autoritativa) e grava em stripe_conversions
 * só quando há fatura paga, e em stripe_churn_events quando cancelada.
 * Ids sintéticos `vindi_*` tornam reexecuções idempotentes, então o mesmo código
 * serve ao webhook (?source=webhook, payload não é confiável: só dispara releitura),
 * ao cron horário e à carga retroativa.
 */
const BASE = 'https://app.vindi.com.br/api/v1'
const START = '2026-11-23'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function vindi(path: string) {
  const key = Deno.env.get('VINDI_API_KEY')!.trim()
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: 'Basic ' + btoa(`${key}:`) } })
  if (!r.ok) throw new Error(`Vindi ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
async function listAll(resource: string, query: string) {
  const out: any[] = []
  for (let page = 1; page < 200; page++) {
    const body = await vindi(`/${resource}?per_page=50&page=${page}&sort_by=id&sort_order=asc&query=${encodeURIComponent(query)}`)
    const items = body?.[resource] ?? []
    out.push(...items)
    if (items.length < 50) break
  }
  return out
}
function monthsOf(sub: any) {
  const n = Number(sub?.interval_count) || 1
  return sub?.interval === 'days' ? n / 30 : n
}
function itemValue(it: any) {
  const ps = it?.pricing_schema ?? {}
  const q = Number(it?.quantity) || 1
  const gross = ps.schema_type === 'per_unit' || ps.schema_type === 'flat' || ps.price != null ? Number(ps.price ?? 0) * (ps.schema_type === 'per_unit' ? q : 1) : 0
  let disc = 0
  for (const d of it?.discounts ?? []) {
    if (d.discount_type === 'percentage') disc += gross * (Number(d.percentage) || 0) / 100
    else if (d.discount_type === 'amount') disc += Number(d.amount) || 0
  }
  return { gross, disc: Math.min(gross, disc) }
}
const r2 = (n: number) => Math.round(n * 100) / 100

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  const fromWebhook = url.searchParams.get('source') === 'webhook'
  let dry = false
  if (!fromWebhook) {
    const cronFail = authenticateCronRequest(req)
    if (cronFail) {
      // Permite usuário interno autenticado (botão / teste)
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      const { data } = await sb.auth.getUser(token)
      const { data: ok } = data?.user ? await sb.rpc('is_internal_user', { _user_id: data.user.id }) : { data: false }
      if (!ok) return cronFail
    }
  }
  dry = url.searchParams.get('dry_run') === 'true'
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    // Todo plano Vindi ganha linha no Mapa de Preços (área "Vindi" até o usuário ajustar).
    const plans = await listAll('plans', '')
    if (!dry && plans.length) {
      const { data: have, error: hErr } = await supabase.from('commission_price_map').select('price_id').like('price_id', 'vindi_plan_%')
      if (hErr) throw hErr
      const known = new Set((have ?? []).map((h: any) => h.price_id))
      const missing = plans.filter((p: any) => !known.has(`vindi_plan_${p.id}`))
      const { error } = missing.length === 0 ? { error: null } : await supabase.from('commission_price_map').insert(missing.map((p: any) => {
        const m = Number(p.interval_count) || 1, vista = /vista/i.test(p.name)
        return { price_id: `vindi_plan_${p.id}`, offer_name: p.name, price_name: p.name, plan_name: p.name, area: 'Vindi',
          payment_type: m === 1 ? 'mensal' : m === 12 ? (vista ? 'anual_avista' : 'anual_mensalizado') : null }
      }))
      if (error) throw error
    }
    const subs = await listAll('subscriptions', `created_at>=${START}`)
    const result = { assinaturas: subs.length, vendas_pagas: 0, aguardando_pagamento: 0, cancelamentos: 0, gravadas: 0, preview: [] as any[] }

    for (const sub of subs) {
      const email = String(sub?.customer?.email ?? '').trim().toLowerCase() || null
      const subId = `vindi_sub_${sub.id}`
      const customerId = `vindi_cus_${sub?.customer?.id}`
      const priceId = `vindi_plan_${sub?.plan?.id}`
      const months = monthsOf(sub)
      let gross = 0, disc = 0
      for (const it of sub.product_items ?? []) { const v = itemValue(it); gross += v.gross; disc += v.disc }
      const mrr = r2(gross / months), mrrNet = r2((gross - disc) / months)

      const bills = await listAll('bills', `subscription_id=${sub.id} status=paid`)
      const paidAt = bills
        .flatMap((b: any) => (b.charges ?? []).map((c: any) => c.paid_at).filter(Boolean))
        .sort()[0] ?? null

      if (paidAt) {
        result.vendas_pagas++
        const { data: existing } = await supabase.from('stripe_conversions').select('id').eq('stripe_subscription_id', subId).maybeSingle()
        const { data: pm } = await supabase.from('commission_price_map').select('area, offer_name, plan_name').eq('price_id', priceId).maybeSingle()
        let cls: any = null
        const { data: c } = await supabase.rpc('classify_stripe_conversion', { p_customer_id: customerId, p_email: email, p_price_id: priceId, p_mrr: mrrNet, p_self_id: existing?.id ?? null })
        cls = Array.isArray(c) ? c[0] : c
        const { data: s } = await supabase.rpc('resolve_stripe_seller', { p_customer_id: customerId, p_email: email, p_at: paidAt, p_price_id: priceId })
        const seller = Array.isArray(s) ? s[0] : s
        const row = {
          stripe_event_id: subId, stripe_subscription_id: subId, stripe_customer_id: customerId, stripe_price_id: priceId,
          stripe_invoice_id: `vindi_bill_${bills[0]?.id}`, customer_email: email,
          area: pm?.area || 'desconhecida', product_name: pm?.offer_name || sub?.product_items?.[0]?.product?.name || null,
          plan_name: pm?.plan_name || sub?.plan?.name || null, mrr, mrr_net: mrrNet,
          gross_amount: r2(gross), net_amount: r2(gross - disc), discount_amount: r2(disc), net_amount_source: 'vindi',
          registered_at: sub.created_at, converted_at: paidAt,
          conversion_type: cls?.conversion_type ?? 'new', previous_mrr: Number(cls?.previous_mrr ?? 0),
          previous_price_id: cls?.previous_price_id ?? null, previous_conversion_id: cls?.previous_conversion_id ?? null,
          assigned_seller_id: seller?.seller_id ?? null, attribution_source: seller?.source ?? 'vindi',
          origem_cliente: 'yampa', payment_status: 'paid', payment_checked_at: new Date().toISOString(),
        }
        if (result.preview.length < 15) result.preview.push({ email, plano: row.plan_name, mrr: mrrNet, pago_em: paidAt, tipo: row.conversion_type })
        if (!dry) {
          const { error } = existing
            ? await supabase.from('stripe_conversions').update(row).eq('id', existing.id)
            : await supabase.from('stripe_conversions').insert(row)
          if (error) throw error
          result.gravadas++
        }
      } else if (sub.status !== 'canceled') result.aguardando_pagamento++

      if (sub.status === 'canceled' && paidAt) {
        result.cancelamentos++
        if (!dry) {
          const { error } = await supabase.from('stripe_churn_events').upsert({
            stripe_subscription_id: subId, stripe_customer_id: customerId, customer_email: email,
            canceled_at: sub.cancel_at ?? sub.updated_at, mrr_lost: mrrNet, plan_name: sub?.plan?.name ?? null,
            stripe_price_id: priceId, source: 'vindi', cancellation_reason: sub.cancel_reason ?? null,
          }, { onConflict: 'stripe_subscription_id' })
          if (error) throw error
        }
      }
    }
    return json({ ok: true, dry_run: dry, ...result })
  } catch (e) {
    console.error('vindi-sync falhou:', (e as Error).message)
    return json({ error: (e as Error).message }, fromWebhook ? 200 : 500)
  }
})
