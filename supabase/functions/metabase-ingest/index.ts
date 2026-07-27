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

    const records = rows.map((r) => {
      const scope = r.scope || 'company';
      const dedupe = [
        captureDate,
        r.metric_key,
        scope,
        r.user_id || '-',
        r.team_id || '-',
        r.campaign_id || '-',
        r.category_id || '-',
      ].join('|');
      return {
        capture_date: captureDate,
        metric_key: r.metric_key,
        scope,
        user_id: r.user_id || null,
        team_id: r.team_id || null,
        campaign_id: r.campaign_id || null,
        area: r.area || null,
        category_id: r.category_id || null,
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

    return new Response(
      JSON.stringify({ ok: true, ingested: records.length, month_refreshed: from }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
