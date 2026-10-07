import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-ingest-secret, authorization, apikey, x-client-info',
};
const METABASE_BASE = 'https://metabase.yampa.app';
const CARD_ID = 221; // 3. PRE_CHURN / pre_churn_table — base oficial
const BATCH = 500;

type Row = Record<string, unknown>;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const toDate = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const tipoOf = (v: unknown): string => {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('cancel')) return 'voluntario';
  if (s.startsWith('inadimpl')) return 'involuntario';
  return 'outro';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const apiKey = Deno.env.get('METABASE_API_KEY');
    if (!apiKey) return json({ error: 'METABASE_API_KEY não configurado' }, 500);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const secret = req.headers.get('x-ingest-secret') || '';
    const auth = req.headers.get('authorization') || '';
    // Rotina diária: só re-sincroniza a base oficial do Metabase (sem parâmetros do chamador).
    if (req.headers.get('x-internal-job') === 'pre-churn-daily') {
      // ok
    } else if (secret) {
      const { data: ok } = await supabase.rpc('ativos_ingest_secret_ok', { p_secret: secret });
      if (ok !== true) return json({ error: 'Unauthorized' }, 401);
    } else if (auth.toLowerCase().startsWith('bearer ')) {
      const { data: u } = await supabase.auth.getUser(auth.slice(7).trim());
      if (!u?.user) return json({ error: 'Unauthorized' }, 401);
      const { data: ok } = await supabase.rpc('is_tatico_or_admin', { _user_id: u.user.id });
      if (ok !== true) return json({ error: 'Forbidden' }, 403);
    } else return json({ error: 'Unauthorized' }, 401);

    const res = await fetch(`${METABASE_BASE}/api/card/${CARD_ID}/query/json`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return json({ error: `Metabase card ${CARD_ID} falhou [${res.status}]` }, 502);
    const raw = await res.json();
    if (!Array.isArray(raw)) return json({ error: 'Formato inesperado do Metabase' }, 502);

    const map = new Map<string, Row>();
    let ignorados = 0;
    for (const r of raw as Row[]) {
      const company = Number(r['Company ID']);
      const dataRef = toDate(r['Data Ref Analise']);
      if (!company || !dataRef) { ignorados++; continue; }
      const tipo = tipoOf(r['Tipo Pre Churn']);
      const email = r['Email'] ? String(r['Email']).trim().toLowerCase() : null;
      const atraso = r['dias_atraso'] == null ? null : Number(r['dias_atraso']);
      map.set(`${company}|${dataRef}|${tipo}`, {
        company_id: company,
        email_norm: email,
        phone: r['User Raw - Email → Cell Phone'] ? String(r['User Raw - Email → Cell Phone']) : null,
        tipo,
        motivo: r['Reason'] ? String(r['Reason']) : null,
        descricao: r['Description'] ? String(r['Description']) : null,
        plano: r['Plano'] ? String(r['Plano']) : null,
        segmento: r['Segmento'] ? String(r['Segmento']) : null,
        origem_cliente: r['origem_cliente'] ? String(r['origem_cliente']) : null,
        sck: r['Sck'] ? String(r['Sck']) : null,
        mrr: Number(r['Total Mrr'] || 0),
        data_ref: dataRef,
        data_pedido: toDate(r['Data Pedido Cancelamento']),
        data_pagamento: toDate(r['Data Pagamento']),
        inicio_vigencia: toDate(r['Inicio Vigencia Plano']),
        final_vigencia: toDate(r['Final Vigencia Plano']),
        future_churn_at: toDate(r['Future Churn At']),
        dias_atraso: Number.isFinite(atraso) ? atraso : null,
        vitalicio: String(r['Status Vitalicio'] ?? '').toLowerCase() === 'vitalicio',
        reembolso: r['Reembolso'] == null ? null : String(r['Reembolso']) === 'true',
        imported_at: new Date().toISOString(),
      });
    }
    const rows = [...map.values()];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from('metas_pre_churn')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'company_id,data_ref,tipo' });
      if (error) return json({ error: error.message, gravados_ate: i }, 500);
    }
    return json({ ok: true, lidos: raw.length, gravados: rows.length, ignorados });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
