import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { readAllPages } from '../_shared/pagedRows.ts';

/**
 * stripe-4blue-sync
 *
 * As vendas de origem 4blue não existem no Stripe. Esta rotina lê os
 * "novo pagante" com origem 4blue da base de ativos pagantes (vinda do
 * Metabase) e insere em stripe_conversions as vendas que ainda não estão lá.
 *
 * Idempotente: a chave é o stripe_event_id sintético `4blue:<email>:<data_inicio>`.
 * Lê todos os snapshots históricos; conversões Stripe continuam origem Yampa.
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
    const rows = await readAllPages<{
      id: number; email: string; plano: string | null; mrr: number | null;
      data_inicio: string; data_snapshot: string;
    }>((from, to) => supabase
      .from('metas_ativos_pagantes_daily')
      .select('id, email, plano, mrr, data_inicio, data_snapshot')
      .ilike('origem_cliente', '4blue')
      .ilike('classificacao_company', 'novo pagante')
      .not('email', 'is', null)
      .not('data_inicio', 'is', null)
      .order('data_snapshot', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to));

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
      const { data, error } = await supabase
        .from('stripe_conversions')
        .upsert(toInsert.slice(i, i + CHUNK), { onConflict: 'stripe_event_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      inserted += data?.length ?? 0;
    }

    // 3) Conversões vindas do Stripe são sempre produto Yampa — 4blue só
    //    existe nas vendas sincronizadas do Metabase (metabase_4blue).
    const { data: fixed, error: fErr } = await supabase
      .from('stripe_conversions')
      .update({ origem_cliente: 'yampa' })
      .or('attribution_source.is.null,attribution_source.neq.metabase_4blue')
      .or('origem_cliente.is.null,origem_cliente.neq.yampa')
      .select('id');
    if (fErr) throw fErr;
    const backfilled = fixed?.length ?? 0;

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
