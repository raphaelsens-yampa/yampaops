import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-ingest-secret',
};

const METABASE_BASE = 'https://metabase.yampa.app';
const BATCH = 500;

type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function spDateISO(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function yesterdaySP(): string {
  return spDateISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function toDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (iso.startsWith('1900-') || iso.startsWith('0001-')) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : iso;
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function txt(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function lower(v: unknown): string | null {
  const s = txt(v);
  return s ? s.toLowerCase() : null;
}

/**
 * Busca o 1º campo presente entre vários nomes possíveis (o card do Metabase
 * pode rotular a coluna de formas diferentes). Comparação case-insensitive e
 * ignorando espaços/underscores.
 */
function pick(row: Row, names: string[]): unknown {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '');
  const wanted = names.map(norm);
  for (const [k, v] of Object.entries(row)) {
    if (wanted.includes(norm(k)) && v !== null && v !== '') return v;
  }
  return null;
}

const PREVIOUS_MRR_KEYS = ['Previous Mrr', 'Previous MRR', 'Mrr Anterior', 'Old Mrr'];
const PAYMENT_DATE_KEYS = [
  'Data Pagamento',
  'Data de Pagamento',
  'Data Pagto',
  'Payment Date',
  'Paid At',
  'Data Pagamento Assinatura',
];


async function metabase(path: string, apiKey: string, body?: unknown): Promise<Row[]> {
  const res = await fetch(`${METABASE_BASE}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(new Error(`Metabase ${path} falhou [${res.status}]: ${detail.slice(0, 500)}`), {
      status: res.status >= 500 ? 502 : res.status,
    });
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw Object.assign(new Error(`Metabase ${path} retornou formato inesperado`), { status: 502 });
  }
  return data as Row[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const apiKey = Deno.env.get('METABASE_API_KEY');
    if (!apiKey) return json({ error: 'METABASE_API_KEY não configurado' }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const provided = req.headers.get('x-ingest-secret') || '';
    if (!provided) return json({ error: 'Unauthorized' }, 401);

    // Validação primária via RPC (lê o segredo do Vault). Fallback para env var se a RPC falhar.
    const { data: secretOk, error: rpcErr } = await supabase.rpc('ativos_ingest_secret_ok', {
      p_secret: provided,
    });
    if (rpcErr) {
      const fallbackSecret = Deno.env.get('ATIVOS_INGEST_SECRET');
      if (!fallbackSecret) {
        return json({
          error: 'Nao foi possivel validar o segredo: RPC falhou e ATIVOS_INGEST_SECRET nao esta configurado',
          detalhe: rpcErr.message,
        }, 500);
      }
      if (!safeEqual(provided, fallbackSecret)) return json({ error: 'Unauthorized' }, 401);
    } else if (secretOk !== true) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let body: Row = {};
    try {
      const raw = await req.text();
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      return json({ error: 'Corpo JSON inválido' }, 400);
    }

    const dataSnapshot = toDate(body.data_snapshot) ?? (body.data_snapshot ? null : yesterdaySP());
    if (!dataSnapshot) return json({ error: 'data_snapshot inválido (use YYYY-MM-DD)' }, 400);

    const [yy, mm] = dataSnapshot.split('-');
    const mesRef = typeof body.mes_ref === 'string' && /^\d{2}\/\d{4}$/.test(body.mes_ref)
      ? body.mes_ref
      : `${mm}/${yy}`;
    const dryRun = body.dry_run === true;
    const yearMonth = `${yy}-${mm}`;
    const dataExecucao = spDateISO();
    const coletadoEm = new Date().toISOString();
    const avisos: string[] = [];

    // ---- Fonte 1: ativos ----
    const ativosRaw = await metabase(
      '/api/dashboard/3/dashcard/110/card/103/query/json',
      apiKey,
      {
        parameters: [{
          id: 'df91507f',
          type: 'date/all-options',
          value: 'past1days',
          target: ['dimension', ['field', 82250, { 'base-type': 'type/Date' }]],
        }],
      },
    );

    const datasEncontradas = Array.from(new Set(ativosRaw.map((r) => toDate(r['Data Ref Analise']) ?? String(r['Data Ref Analise'] ?? ''))));
    const divergentes = datasEncontradas.filter((d) => d !== dataSnapshot);
    if (ativosRaw.length > 0 && divergentes.length > 0) {
      return json({
        error: 'Data Ref Analise divergente de data_snapshot — nada foi gravado',
        data_snapshot: dataSnapshot,
        datas_encontradas: datasEncontradas,
      }, 409);
    }

    const seen = new Set<string>();
    const ativos: Row[] = [];
    let dupAtivos = 0;
    let semEmail = 0;
    for (const r of ativosRaw) {
      const cid = txt(r['Company ID']) ?? '';
      const key = cid;
      if (seen.has(key)) { dupAtivos++; continue; }
      seen.add(key);
      const email = lower(r['Email']);
      if (!email) semEmail++;
      ativos.push({
        data_snapshot: dataSnapshot,
        data_execucao: dataExecucao,
        mes_ref: mesRef,
        status_assinatura: 'ativo',
        company_id: cid,
        email,
        plano: txt(r['Plano Atual']),
        nome_oferta: txt(r['Nome Oferta']),
        stripe_price_id: txt(r['Stripe Price ID']),
        mrr: toNum(r['New Mrr']),
        origem_cliente: lower(r['Origem Cliente']),
        data_inicio: toDate(r['Inicio Vigencia Plano']),
        data_cancelamento: null,
        classificacao_company: txt(r['Classificacao Company']),
        status_pagamento: txt(r['Status_pagamento']),
        gateway: txt(r['Gateway']),
        recorrencia_pagamento: txt(r['Recorrencia Pagamento']),
        tipo_churn: null,
        fonte: 'Dash 3 card 103 (edge function)',
        coletado_em: coletadoEm,
      });
    }

    // ---- Fonte 2: cancelados do mês ----
    const churnRaw = await metabase('/api/card/181/query/json', apiKey);
    const churnMes = churnRaw.filter((r) => String(r['Mes Ref Analise'] ?? '').startsWith(yearMonth));
    const churnIds = new Set<string>();
    let dupChurn = 0;
    for (const r of churnMes) {
      const cid = txt(r['Company ID']) ?? '';
      if (churnIds.has(cid)) dupChurn++;
      churnIds.add(cid);
    }
    const cancelados: Row[] = churnMes.map((r) => ({
      data_snapshot: dataSnapshot,
      data_execucao: dataExecucao,
      mes_ref: mesRef,
      status_assinatura: 'cancelado',
      company_id: txt(r['Company ID']) ?? '',
      email: lower(r['Email']),
      plano: txt(r['Plano']),
      nome_oferta: txt(r['Nome Oferta']),
      stripe_price_id: null,
      mrr: toNum(r['Total Mrr']),
      origem_cliente: lower(r['Origem Cliente']),
      data_inicio: toDate(r['Inicio Vigencia Plano']),
      data_cancelamento: toDate(r['Churn At']),
      classificacao_company: null,
      status_pagamento: null,
      gateway: txt(r['Gateway']),
      recorrencia_pagamento: txt(r['Recorrencia Pagamento']),
      tipo_churn: txt(r['Tipo Churn']),
      fonte: 'Dash 11 card 181 (edge function)',
      coletado_em: coletadoEm,
    }));

    // ---- Fonte 2b: histórico de churn (últimos 24 meses) ----
    const churnMonths = Number(body.churn_history_months) > 0
      ? Math.min(120, Number(body.churn_history_months))
      : 24;
    const cutoff = (() => {
      const [y, m] = dataSnapshot.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 - churnMonths, 1));
      return d.toISOString().slice(0, 10);
    })();
    const churnHistMap = new Map<string, Row>();
    for (const r of churnRaw) {
      const email = lower(r['Email']);
      const canceledAt = toDate(r['Churn At']);
      if (!email || !canceledAt || canceledAt < cutoff) continue;
      const key = `${email}|${canceledAt}`;
      if (churnHistMap.has(key)) continue;
      churnHistMap.set(key, {
        email_norm: email,
        company_id: txt(r['Company ID']),
        plano: txt(r['Plano']),
        nome_oferta: txt(r['Nome Oferta']),
        gateway: txt(r['Gateway']),
        mrr: toNum(r['Total Mrr']),
        data_inicio: toDate(r['Inicio Vigencia Plano']),
        data_cancelamento: canceledAt,
        tipo_churn: txt(r['Tipo Churn']),
        fonte: 'metabase',
      });
    }
    const churnHist = Array.from(churnHistMap.values());

    // ---- Fonte 3: trials em curso ----
    const trialsRaw = await metabase('/api/card/267/query/json', apiKey);
    const fimMes = lastDayOfMonth(dataSnapshot);
    const trialsFiltrados = trialsRaw.filter((r) =>
      toDate(r['Data Ref Analise']) === fimMes &&
      String(r['status_conversao'] ?? '').trim().toLowerCase() === 'nao convertido'
    );
    const trials: Row[] = trialsFiltrados.map((r) => ({
      data_snapshot: dataSnapshot,
      data_execucao: dataExecucao,
      mes_ref: mesRef,
      status_assinatura: 'trial',
      company_id: txt(r['Company ID']) ?? '',
      email: lower(r['Email']),
      plano: txt(r['Plano']),
      nome_oferta: txt(r['Nome Oferta']),
      stripe_price_id: null,
      mrr: toNum(r['Paid Mrr']),
      origem_cliente: null,
      data_inicio: toDate(r['Data Freetrial']),
      data_cancelamento: null,
      classificacao_company: null,
      status_pagamento: null,
      gateway: null,
      recorrencia_pagamento: null,
      tipo_churn: null,
      fonte: 'Dash 6 card 267 (edge function)',
      coletado_em: coletadoEm,
    }));

    // ---- Validações ----
    const mrrAtivos = ativos.reduce((s, r) => s + (Number(r.mrr) || 0), 0);
    const porOrigem: Record<string, number> = {};
    for (const r of ativos) {
      const k = (r.origem_cliente as string) ?? 'sem_origem';
      porOrigem[k] = (porOrigem[k] || 0) + 1;
    }
    if (ativos.length === 0) avisos.push('Nenhum ativo lido do Metabase.');
    if (mrrAtivos === 0) avisos.push('Soma de MRR dos ativos ficou zero.');
    const somaOrigem = Object.values(porOrigem).reduce((a, b) => a + b, 0);
    if (somaOrigem !== ativos.length) {
      avisos.push(`Contagem por origem (${somaOrigem}) difere do total de ativos (${ativos.length}).`);
    }
    if (semEmail > 0) avisos.push(`${semEmail} linha(s) de ativos sem e-mail.`);
    if (dupChurn > 0) avisos.push(`${dupChurn} duplicata(s) de Company ID encontradas no churn (esperado 0).`);
    if (churnMes.length === 0) avisos.push(`Nenhum cancelamento encontrado para ${yearMonth}.`);
    if (trials.length === 0) avisos.push(`Nenhum trial em curso encontrado para ${fimMes}.`);

    const lidos = { ativo: ativosRaw.length, cancelado: churnMes.length, trial: trialsFiltrados.length };
    const base = {
      data_snapshot: dataSnapshot,
      mes_ref: mesRef,
      dry_run: dryRun,
      lidos,
      duplicadas_removidas_ativos: dupAtivos,
      duplicadas_encontradas_churn: dupChurn,
      mrr_total_ativos: Number(mrrAtivos.toFixed(2)),
      ativos_por_origem: porOrigem,
      churn_historico: { meses: churnMonths, desde: cutoff, lidos: churnHist.length },
      avisos,
    };

    if (dryRun) {
      return json({ ...base, gravados: { ativo: 0, cancelado: 0, trial: 0, churn_historico: 0 } });
    }

    const gravados = { ativo: 0, cancelado: 0, trial: 0, churn_historico: 0 };
    const grupos: Array<[keyof typeof gravados, Row[]]> = [
      ['ativo', ativos],
      ['cancelado', cancelados],
      ['trial', trials],
    ];

    for (const [status, rows] of grupos) {
      if (rows.length === 0) continue;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const { error } = await supabase
          .from('metas_ativos_pagantes_daily')
          .upsert(chunk, { onConflict: 'data_snapshot,company_id,status_assinatura', ignoreDuplicates: false });
        if (error) {
          return json({
            ...base,
            error: `Falha ao gravar ${status} (lote ${i / BATCH + 1}): ${error.message}`,
            gravados,
            gravacao_parcial: true,
          }, 500);
        }
        gravados[status] += chunk.length;
      }
    }

    // Histórico de churn (idempotente por email + data de cancelamento)
    for (let i = 0; i < churnHist.length; i += BATCH) {
      const chunk = churnHist.slice(i, i + BATCH);
      const { error } = await supabase
        .from('metas_churn_historico')
        .upsert(chunk, { onConflict: 'email_norm,data_cancelamento', ignoreDuplicates: false });
      if (error) {
        avisos.push(`Falha ao gravar histórico de churn (lote ${i / BATCH + 1}): ${error.message}`);
        break;
      }
      gravados.churn_historico += chunk.length;
    }

    return json({ ...base, gravados });
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    return json({ error: (e as Error)?.message ?? String(e) }, status);
  }
});
