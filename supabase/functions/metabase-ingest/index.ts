import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Row {
  metric_key: string;
  scope?: string;
  user_id?: string | null;
  team_id?: string | null;
  campaign_id?: string | null;
  area?: string | null;
  category_id?: string | null;
  amount?: number;
  deals_count?: number;
  source_url?: string | null;
  raw?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!cronSecret || provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const captureDate: string = body.capture_date;
    const rows: Row[] = body.rows || [];

    if (!captureDate || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: 'capture_date and rows[] required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Carrega categorias para resolver category_id a partir de metric_key
    const { data: catRows } = await supabase
      .from('goal_categories')
      .select('id, slug, auto_source')
      .eq('is_active', true);

    const normalize = (s: string) =>
      (s || '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');

    // Aliases: metric_key vindo do Metabase -> slug da categoria
    const aliasToSlug: Record<string, string> = {
      churn_pct: 'churn-rate-logos',
      churn_rate: 'churn-rate-logos',
      churn_rate_logos: 'churn-rate-logos',
      churn_qtd: 'churn-logos',
      churn_logos: 'churn-logos',
      churn_mrr: 'churn-mrr',
      new_mrr: 'new_mrr',
      net_mrr: 'net-mrr',
      ltv: 'ltv',
      cac: 'cac',
      ltv_cac: 'ltv_cac',
      upsell: 'upsell',
      downsell: 'downsell',
      campanha_mrr: 'campanha_mrr',
      recuperados: 'recuperados',
      recuperacao_churn: 'recuperacao_churn',
      retencao: 'retencao',
      total_mrr: 'total_de_mrr_ms3g6o38',
    };

    const bySlug = new Map<string, string>();
    const byAutoSource = new Map<string, string>();
    for (const c of catRows || []) {
      if (c.slug) bySlug.set(normalize(c.slug), c.id);
      if (c.auto_source) byAutoSource.set(normalize(c.auto_source), c.id);
    }

    const resolveCategory = (metricKey?: string, provided?: string | null): string | null => {
      if (provided) return provided;
      if (!metricKey) return null;
      const k = normalize(metricKey);
      // 1) alias direto
      const aliasSlug = aliasToSlug[k];
      if (aliasSlug && bySlug.has(normalize(aliasSlug))) return bySlug.get(normalize(aliasSlug))!;
      // 2) slug igual ao metric_key
      if (bySlug.has(k)) return bySlug.get(k)!;
      // 3) auto_source igual ao metric_key (ex.: stripe_churn_mrr)
      if (byAutoSource.has(k)) return byAutoSource.get(k)!;
      return null;
    };

    const unresolved: string[] = [];
    const records = rows.map((r) => {
      const scope = r.scope || 'company';
      const resolvedCategoryId = resolveCategory(r.metric_key, r.category_id ?? null);
      if (!resolvedCategoryId) unresolved.push(r.metric_key);
      const dedupe = [
        captureDate,
        r.metric_key,
        scope,
        r.user_id || '-',
        r.team_id || '-',
        r.campaign_id || '-',
        resolvedCategoryId || '-',
      ].join('|');
      return {
        capture_date: captureDate,
        metric_key: r.metric_key,
        scope,
        user_id: r.user_id || null,
        team_id: r.team_id || null,
        campaign_id: r.campaign_id || null,
        area: r.area || null,
        category_id: resolvedCategoryId,
        amount: Number(r.amount || 0),
        deals_count: Number(r.deals_count || 0),
        source_url: r.source_url || null,
        raw_payload: r.raw || null,
        dedupe_key: dedupe,
      };
    });

    const { error } = await supabase
      .from('metabase_daily_raw')
      .upsert(records, { onConflict: 'dedupe_key' });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refDate = new Date(captureDate);
    const from = new Date(refDate.getFullYear(), refDate.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).toISOString().slice(0, 10);

    const { error: refreshErr } = await supabase.rpc('refresh_metabase_monthly_agg', {
      p_from: from,
      p_to: to,
    });
    if (refreshErr) {
      return new Response(JSON.stringify({ error: refreshErr.message, stage: 'refresh' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Nenhum dia pode ficar sem snapshot: replica o último dia capturado nas lacunas.
    const { data: gapFill } = await supabase.rpc('fill_snapshot_gaps', {
      p_from: null,
      p_to: null,
    });


    return new Response(
      JSON.stringify({ ok: true, ingested: records.length, month_refreshed: from, unresolved_metric_keys: Array.from(new Set(unresolved)) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
