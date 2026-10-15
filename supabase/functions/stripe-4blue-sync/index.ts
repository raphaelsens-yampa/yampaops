import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * stripe-4blue-sync
 *
 * As vendas de origem 4blue não existem no Stripe. Esta rotina lê os
 * "novo pagante" com origem 4blue da base de ativos pagantes (vinda do
 * Metabase) e insere em stripe_conversions as vendas que ainda não estão lá.
 *
 * Idempotente: a chave é o stripe_event_id sintético `4blue:<email>:<data_inicio>`.
 * Também (re)preenche origem_cliente das conversões Stripe por e-mail.
 */

const INTERNAL_JOB = 'stripe-4blue-sync-daily';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const isCron = req.headers.get('x-internal-job') === INTERNAL_JOB;
  if (!isCron) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1) Vendas 4blue "novo pagante" da base de ativos pagantes (Metabase).
    const { data: rows, error: readErr } = await supabase
      .from('metas_ativos_pagantes_daily')
      .select('email, plano, mrr, data_inicio, data_snapshot')
      .ilike('origem_cliente', '4blue')
      .ilike('classificacao_company', 'novo pagante')
      .not('email', 'is', null)
      .not('data_inicio', 'is', null)
      .order('data_snapshot', { ascending: false });
    if (readErr) throw readErr;

    // Dedup por e-mail + data_inicio (o snapshot mais recente vem primeiro).
    const seen = new Set<string>();
    const candidates: { email: string; plano: string | null; mrr: number; inicio: string; eventId: string }[] = [];
    for (const r of rows ?? []) {
      const email = String(r.email).trim().toLowerCase();
      const inicio = String(r.data_inicio);
      const key = `${email}|${inicio}`;
      if (!email || seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        email,
        plano: r.plano ? String(r.plano) : null,
        mrr: Number(r.mrr) || 0,
        inicio,
        eventId: `4blue:${email}:${inicio}`,
      });
    }

    // 2) Quais já existem em stripe_conversions (pelo event id sintético)?
    const existing = new Set<string>();
    const CHUNK = 200;
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const ids = candidates.slice(i, i + CHUNK).map((c) => c.eventId);
      const { data, error } = await supabase
        .from('stripe_conversions')
        .select('stripe_event_id')
        .in('stripe_event_id', ids);
      if (error) throw error;
      for (const d of data ?? []) existing.add(String(d.stripe_event_id));
    }

    const toInsert = candidates
      .filter((c) => !existing.has(c.eventId))
      .map((c) => ({
        customer_email: c.email,
        converted_at: `${c.inicio}T12:00:00-03:00`,
        conversion_type: 'new',
        plan_name: c.plano,
        mrr: c.mrr,
        area: 'Parceria',
        origem_cliente: '4blue',
        attribution_source: 'metabase_4blue',
        stripe_event_id: c.eventId,
      }));

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase
        .from('stripe_conversions')
        .insert(toInsert.slice(i, i + CHUNK));
      if (error) throw error;
      inserted += Math.min(CHUNK, toInsert.length - i);
    }

    // 3) (Re)preencher origem_cliente das conversões Stripe por e-mail.
    const { data: originRows, error: oErr } = await supabase
      .from('metas_ativos_pagantes_daily')
      .select('email, origem_cliente')
      .not('email', 'is', null)
      .not('origem_cliente', 'is', null);
    if (oErr) throw oErr;

    const originByEmail = new Map<string, string>();
    for (const r of originRows ?? []) {
      originByEmail.set(String(r.email).trim().toLowerCase(), String(r.origem_cliente).trim().toLowerCase());
    }

    const { data: noOrigin, error: nErr } = await supabase
      .from('stripe_conversions')
      .select('id, customer_email')
      .is('origem_cliente', null)
      .not('customer_email', 'is', null);
    if (nErr) throw nErr;

    let backfilled = 0;
    for (const c of noOrigin ?? []) {
      const origem = originByEmail.get(String(c.customer_email).trim().toLowerCase());
      if (!origem) continue;
      const { error } = await supabase
        .from('stripe_conversions')
        .update({ origem_cliente: origem })
        .eq('id', c.id);
      if (!error) backfilled++;
    }

    return new Response(
      JSON.stringify({ ok: true, candidatos: candidates.length, inseridos: inserted, origem_preenchida: backfilled }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('stripe-4blue-sync falhou:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
