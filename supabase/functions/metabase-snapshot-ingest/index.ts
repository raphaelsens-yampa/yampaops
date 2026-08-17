import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Ingestão diária vinda do Metabase (via Claude / MCP / n8n).
 *
 * Grava SEMPRE o payload bruto em public.metabase_ingest_log (histórico auditável),
 * depois aplica as linhas nas tabelas metas_* de forma idempotente
 * (delete do dia + insert), e por fim fecha lacunas de snapshot.
 *
 * POST /functions/v1/metabase-snapshot-ingest
 * Header: x-cron-secret: <CRON_SECRET>
 * Body:
 * {
 *   "data": "2026-08-17",
 *   "fonte": "claude",
 *   "tables": {
 *     "metas_snapshot_diario": [ {...}, ... ],
 *     "metas_daily": [ ... ],
 *     "metas_price_daily": [ ... ],
 *     "metas_origem_daily": [ ... ],
 *     "metas_trials_daily": [ ... ]
 *   }
 * }
 */

const ALLOWED_TABLES = [
  'metas_snapshot_diario',
  'metas_daily',
  'metas_price_daily',
  'metas_origem_daily',
  'metas_trials_daily',
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!cronSecret || provided !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const dataRef = body.data ?? body.capture_date ?? body.data_ref;
  const fonte = typeof body.fonte === 'string' && body.fonte.trim() ? body.fonte.trim() : 'claude';
  const tables = (body.tables ?? {}) as Record<string, unknown>;

  if (!isDate(dataRef)) {
    return json({ error: 'Campo "data" obrigatório no formato YYYY-MM-DD' }, 400);
  }
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    return json({ error: 'Campo "tables" deve ser um objeto { nome_tabela: [linhas] }' }, 400);
  }

  const unknownTables = Object.keys(tables).filter(
    (t) => !ALLOWED_TABLES.includes(t as AllowedTable),
  );
  if (unknownTables.length) {
    return json(
      { error: `Tabelas não permitidas: ${unknownTables.join(', ')}`, allowed: ALLOWED_TABLES },
      400,
    );
  }

  const results: Record<string, { received: number; written: number; status: string; error?: string }> = {};

  for (const table of Object.keys(tables) as AllowedTable[]) {
    const raw = tables[table];
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    let status = 'ok';
    let errorMessage: string | null = null;
    let written = 0;

    try {
      if (!Array.isArray(raw)) {
        throw new Error(`"${table}" deve ser um array de linhas`);
      }

      // Normaliza a data de referência e a fonte em cada linha.
      const normalized = rows.map((r) => ({
        ...r,
        data: isDate(r.data as string) ? r.data : dataRef,
        fonte: (r.fonte as string) ?? fonte,
      }));

      const offDay = normalized.filter((r) => r.data !== dataRef).length;
      if (offDay > 0 && table !== 'metas_trials_daily') {
        throw new Error(`${offDay} linha(s) com "data" diferente de ${dataRef}`);
      }

      if (normalized.length > 0) {
        // Idempotente: remove o dia e regrava o conjunto completo enviado.
        const { error: delErr } = await supabase.from(table).delete().eq('data', dataRef);
        if (delErr) throw new Error(`delete: ${delErr.message}`);

        const CHUNK = 500;
        for (let i = 0; i < normalized.length; i += CHUNK) {
          const slice = normalized.slice(i, i + CHUNK);
          const { error: insErr } = await supabase.from(table).insert(slice);
          if (insErr) throw new Error(`insert: ${insErr.message}`);
          written += slice.length;
        }
      }
    } catch (e) {
      status = 'error';
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    // Histórico bruto: gravado mesmo quando a aplicação nas metas_* falha.
    const { error: logErr } = await supabase.from('metabase_ingest_log').insert({
      data_ref: dataRef,
      fonte,
      target_table: table,
      rows_received: rows.length,
      rows_written: written,
      status,
      error_message: errorMessage,
      raw_payload: { data: dataRef, fonte, table, rows: raw ?? null },
    });
    if (logErr) console.error(`Falha ao gravar log de ${table}: ${logErr.message}`);

    results[table] = {
      received: rows.length,
      written,
      status,
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  }

  // Fecha eventuais lacunas de snapshot (dias sem captura).
  let gapsFilled: unknown = null;
  const { data: gapData, error: gapErr } = await supabase.rpc('fill_snapshot_gaps', {
    p_from: null,
    p_to: null,
  });
  if (gapErr) console.error(`fill_snapshot_gaps: ${gapErr.message}`);
  else gapsFilled = gapData ?? null;

  const failed = Object.values(results).some((r) => r.status === 'error');

  return json(
    {
      ok: !failed,
      data: dataRef,
      fonte,
      results,
      snapshot_gaps_filled: gapsFilled,
    },
    failed ? 207 : 200,
  );
});
