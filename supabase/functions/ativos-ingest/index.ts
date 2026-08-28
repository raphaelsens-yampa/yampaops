import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-ingest-secret, authorization, apikey, x-client-info',
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

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.trunc(n);
}

function toBool(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 't', '1', 'sim', 'yes', 'y'].includes(s)) return true;
  if (['false', 'f', '0', 'nao', 'não', 'no', 'n'].includes(s)) return false;
  return null;
}

/** Texto de identificador numérico sem sufixo ".0" (ex.: "1234.0" -> "1234"). */
function idTxt(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  return s.replace(/\.0+$/, '');
}

/** 'MM/YYYY' a partir de uma data ISO. */
function mesRefFromISO(iso: string): string {
  const [y, m] = iso.split('-');
  return `${m}/${y}`;
}

function firstDayOfMonthISO(iso: string): string {
  const [y, m] = iso.split('-');
  return `${y}-${m}-01`;
}

const PREVIOUS_MRR_KEYS = ['Previous Mrr', 'Previous MRR', 'previous_mrr', 'Mrr Anterior', 'Old Mrr'];
const PAYMENT_DATE_KEYS = [
  'Data Pagamento',
  'data_pagamento',
  'Data de Pagamento',
  'Data Pagto',
  'Payment Date',
  'Paid At',
  'Data Pagamento Assinatura',
];
const NEW_MRR_KEYS = ['New Mrr', 'new_mrr', 'Mrr', 'mrr'];
const COMPANY_ID_KEYS = ['Company ID', 'company_id'];
const EMAIL_KEYS = ['Email', 'email'];
const PLANO_ATUAL_KEYS = ['Plano Atual', 'plano_atual', 'Plano', 'plano'];
const NOME_OFERTA_KEYS = ['Nome Oferta', 'nome_oferta'];
const PRICE_ID_KEYS = ['Stripe Price ID', 'stripe_price_id'];
const ORIGEM_KEYS = ['Origem Cliente', 'origem_cliente'];
const INICIO_VIGENCIA_KEYS = ['Inicio Vigencia Plano', 'inicio_vigencia_plano'];
const CLASSIFICACAO_KEYS = ['Classificacao Company', 'classificacao_company'];
const STATUS_PAGAMENTO_KEYS = ['Status_pagamento', 'status_pagamento', 'Status Pagamento'];
const GATEWAY_KEYS = ['Gateway', 'gateway'];
const RECORRENCIA_KEYS = ['Recorrencia Pagamento', 'recorrencia_pagamento'];
const DATA_REF_KEYS = ['Data Ref Analise', 'data_ref_analise'];

/** Linha de ativo pagante para metas_ativos_pagantes_daily. */
function mapAtivo(
  r: Row,
  opts: {
    dataSnapshot: string;
    mesRef: string;
    tipoSnapshot: string;
    dataExecucao: string;
    coletadoEm: string;
    fonte: string;
  },
): Row {
  return {
    data_snapshot: opts.dataSnapshot,
    data_execucao: opts.dataExecucao,
    mes_ref: opts.mesRef,
    status_assinatura: 'ativo',
    tipo_snapshot: opts.tipoSnapshot,
    company_id: txt(pick(r, COMPANY_ID_KEYS)) ?? '',
    email: lower(pick(r, EMAIL_KEYS)),
    plano: txt(pick(r, PLANO_ATUAL_KEYS)),
    nome_oferta: txt(pick(r, NOME_OFERTA_KEYS)),
    stripe_price_id: txt(pick(r, PRICE_ID_KEYS)),
    mrr: toNum(pick(r, NEW_MRR_KEYS)),
    previous_mrr: toNum(pick(r, PREVIOUS_MRR_KEYS)),
    data_pagamento: toDate(pick(r, PAYMENT_DATE_KEYS)),
    origem_cliente: lower(pick(r, ORIGEM_KEYS)),
    data_inicio: toDate(pick(r, INICIO_VIGENCIA_KEYS)),
    data_cancelamento: null,
    classificacao_company: txt(pick(r, CLASSIFICACAO_KEYS)),
    status_pagamento: txt(pick(r, STATUS_PAGAMENTO_KEYS)),
    gateway: txt(pick(r, GATEWAY_KEYS)),
    recorrencia_pagamento: txt(pick(r, RECORRENCIA_KEYS)),
    tipo_churn: null,
    fonte: opts.fonte,
    coletado_em: opts.coletadoEm,
  };
}

const CHURN_DAILY_FONTE = 'Dash 11 card 181 churn_analitico via API';

/**
 * Linha analítica de churn para metas_churn_daily.
 * Colunas ignoradas de propósito: Description, Is Trail (duplicata com typo de
 * Is Trial), a 2ª coluna "Tipo Churn" do card e Import Date.
 */
function mapChurnDaily(r: Row, dataExecucao: string, coletadoEm: string): Row | null {
  const mesRefAnalise = toDate(r['Mes Ref Analise']);
  const companyId = txt(r['Company ID']);
  if (!mesRefAnalise || !companyId) return null;
  return {
    mes_ref: mesRefFromISO(mesRefAnalise),
    mes_ref_data: firstDayOfMonthISO(mesRefAnalise),
    company_id: companyId,
    email: lower(r['Email']),
    cell_phone: txt(r['Cell Phone']),
    segmento: txt(r['Segmento']),
    plano: txt(r['Plano']),
    origem_cliente: lower(r['Origem Cliente']),
    gateway: txt(r['Gateway']),
    sck: txt(r['Sck']),
    owner_id: idTxt(r['Owner ID']),
    tipo_churn: txt(r['Tipo Churn']),
    reason: txt(r['Reason']),
    churn_at: toDate(r['Churn At']),
    data_ref_churn: toDate(r['Data Ref Churn']),
    data_pedido_cancelamento: toDate(r['Data Pedido Cancelamento']),
    activation_date: toDate(r['Activation Date']),
    data_pagamento: toDate(r['Data Pagamento']),
    inicio_vigencia_plano: toDate(r['Inicio Vigencia Plano']),
    final_vigencia_plano: toDate(r['Final Vigencia Plano']),
    vigencia: toInt(r['Vigencia']),
    recorrencia_pagamento: toInt(r['Recorrencia Pagamento']),
    intervalo_cobranca_stripe: txt(r['Intervalo Combranca Stripe']),
    id_oferta: idTxt(r['ID Oferta']),
    nome_oferta: txt(r['Nome Oferta']),
    stripe_price_name: txt(r['Stripe Price Name']),
    preco_stripe: toNum(r['Preco Stripe']),
    valor_pago: toNum(r['Valor Pago']),
    total_mrr: toNum(r['Total Mrr']),
    cupom_aplicado: txt(r['Cupom Aplicado']),
    cd_promo: txt(r['Cd Promo']),
    status_transacao: txt(r['Status Transacao']),
    status_vitalicio: txt(r['Status Vitalicio']),
    is_4blue_customer: toBool(r['Is 4blue Costumer']),
    is_illuminist: toBool(r['Is Illuminist']),
    is_freetrial: toBool(r['Is Freetrial']),
    is_trial: toBool(r['Is Trial']),
    is_perpetual: toBool(r['Is Perpetual']),
    is_paying: toBool(r['Is Paying']),
    is_bonus: toBool(r['Is Bonus']),
    is_refund: toBool(r['Is Refund']),
    data_ref_analise: toDate(r['Data Ref Analise']),
    data_extracao: dataExecucao,
    fonte: CHURN_DAILY_FONTE,
    coletado_em: coletadoEm,
  };
}



/** Últimos dias dos meses fechados de 2026 disponíveis no card 103. */
const CLOSED_MONTH_SNAPSHOTS = [
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
];

/** database_id do card 103 (cacheado por invocação). */
let card103DatabaseId: number | null = null;
async function getCard103DatabaseId(apiKey: string): Promise<number> {
  if (card103DatabaseId != null) return card103DatabaseId;
  const res = await fetch(`${METABASE_BASE}/api/card/103`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(new Error(`Metabase /api/card/103 falhou [${res.status}]: ${detail.slice(0, 300)}`), {
      status: res.status >= 500 ? 502 : res.status,
    });
  }
  const card = await res.json();
  const dbId = card?.database_id ?? card?.dataset_query?.database;
  if (typeof dbId !== 'number') {
    throw Object.assign(new Error('Não foi possível determinar o database_id do card 103'), { status: 502 });
  }
  card103DatabaseId = dbId;
  return dbId;
}

/**
 * Consulta o card 103 como source-table via /api/dataset/json (rota de
 * exportação, SEM o teto de 2.000 linhas do /api/dataset), filtrando
 * data_ref_analise no servidor. Retorna array de objetos já nomeados com
 * os nomes de exibição — iguais aos de /api/card/103/query/json.
 */
async function metabaseDatasetCard103(apiKey: string, from: string, to: string): Promise<Row[]> {
  const database = await getCard103DatabaseId(apiKey);
  const mbql = {
    database,
    type: 'query',
    query: {
      'source-table': 'card__103',
      filter: ['between', ['field', 'data_ref_analise', { 'base-type': 'type/Date' }], from, to],
    },
  };
  const fd = new URLSearchParams();
  fd.set('query', JSON.stringify(mbql));
  const res = await fetch(`${METABASE_BASE}/api/dataset/json`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/x-www-form-urlencoded' },
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw Object.assign(new Error(`Metabase /api/dataset/json falhou [${res.status}]: ${detail.slice(0, 500)}`), {
      status: res.status >= 500 ? 502 : res.status,
    });
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw Object.assign(new Error('Metabase /api/dataset/json retornou formato inesperado'), { status: 502 });
  }
  // Trava de segurança: 2.000 redondo é a assinatura de truncamento do
  // /api/dataset; nunca gravar um mês truncado.
  if (data.length === 2000) {
    throw Object.assign(
      new Error(
        'Leitura TRUNCADA: exatamente 2.000 linhas (teto do /api/dataset). ' +
        'Nada foi gravado. Use /api/dataset/json ou revise o período.',
      ),
      { status: 502 },
    );
  }
  return data as Row[];
}

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
    const authHeader = req.headers.get('authorization') || '';

    if (provided) {
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
    } else if (authHeader.toLowerCase().startsWith('bearer ')) {
      // Caminho alternativo: admin autenticado no app pode disparar a ingestão.
      const token = authHeader.slice(7).trim();
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
      const { data: isAdmin, error: roleErr } = await supabase.rpc('has_role', {
        _user_id: userData.user.id,
        _role: 'admin',
      });
      if (roleErr || isAdmin !== true) return json({ error: 'Forbidden' }, 403);
    } else {
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

    // =====================================================================
    // MODO backfill_mensal: fotografia do último dia de UM mês FECHADO.
    // Não executa nenhum passo do fluxo diário (cards 181/267 e ingest do dia).
    // Consulta via /api/dataset com filtro no servidor (card__103), para não
    // trazer o card inteiro. A guarda de data 409 não se aplica — validamos
    // por grupo.
    // =====================================================================
    if (body.backfill_mensal === true) {
      const mesAtualInicio = firstDayOfMonthISO(spDateISO());
      const mesesFechados = CLOSED_MONTH_SNAPSHOTS.filter((d) => d < mesAtualInicio);

      const mesPedido = typeof body.mes === 'string' ? body.mes.trim() : '';
      if (!/^\d{4}-\d{2}$/.test(mesPedido)) {
        return json({
          error: 'Informe "mes" no formato YYYY-MM. Processamos um mês por invocação.',
          meses_disponiveis: mesesFechados.map((d) => d.slice(0, 7)),
        }, 400);
      }
      const snapEsperado = mesesFechados.find((d) => d.startsWith(mesPedido));
      if (!snapEsperado) {
        return json({
          error: `Mês ${mesPedido} não é um mês fechado disponível.`,
          meses_disponiveis: mesesFechados.map((d) => d.slice(0, 7)),
        }, 400);
      }

      const inicioMes = `${mesPedido}-01`;
      const raw = await metabaseDatasetCard103(apiKey, inicioMes, snapEsperado);

      const semData = raw.filter((r) => !toDate(pick(r, DATA_REF_KEYS))).length;
      const rows = raw.filter((r) => toDate(pick(r, DATA_REF_KEYS)) === snapEsperado);
      const foraDoCorte = raw.length - rows.length - semData;

      if (foraDoCorte > 0) {
        avisos.push(`${foraDoCorte} linha(s) com data_ref_analise diferente de ${snapEsperado} foram descartadas.`);
      }
      if (rows.length === 0) {
        return json({
          modo: 'backfill_mensal',
          mes: mesPedido,
          data_snapshot: snapEsperado,
          dry_run: dryRun,
          erro: `Nenhuma linha com data_ref_analise = ${snapEsperado} retornada pelo Metabase.`,
          linhas_lidas: raw.length,
          avisos,
        }, 200);
      }

      const vistos = new Set<string>();
      const linhas: Row[] = [];
      let dup = 0;
      for (const r of rows) {
        const cid = txt(pick(r, COMPANY_ID_KEYS)) ?? '';
        if (vistos.has(cid)) { dup++; continue; }
        vistos.add(cid);
        linhas.push(mapAtivo(r, {
          dataSnapshot: snapEsperado,
          mesRef: mesRefFromISO(snapEsperado),
          tipoSnapshot: 'fechamento_mensal',
          dataExecucao,
          coletadoEm,
          fonte: 'Dash 3 card 103 fechamento mensal (edge function)',
        }));
      }

      const mrrTotal = Number(linhas.reduce((s, r) => s + (Number(r.mrr) || 0), 0).toFixed(2));
      let gravados = 0;
      let erro: string | undefined;

      if (!dryRun) {
        for (let i = 0; i < linhas.length; i += BATCH) {
          const chunk = linhas.slice(i, i + BATCH);
          const { error } = await supabase
            .from('metas_ativos_pagantes_daily')
            .upsert(chunk, { onConflict: 'data_snapshot,company_id,status_assinatura', ignoreDuplicates: false });
          if (error) {
            erro = `lote ${i / BATCH + 1}: ${error.message}`;
            avisos.push(`Falha ao gravar snapshot ${snapEsperado}: ${error.message}`);
            break;
          }
          gravados += chunk.length;
        }
      }

      return json({
        modo: 'backfill_mensal',
        mes: mesPedido,
        data_snapshot: snapEsperado,
        dry_run: dryRun,
        linhas_lidas: raw.length,
        linhas_sem_data_ref: semData,
        linhas_fora_do_corte: foraDoCorte,
        duplicadas_removidas: dup,
        ativos: linhas.length,
        mrr_total: mrrTotal,
        gravados,
        erro,
        meses_disponiveis: mesesFechados.map((d) => d.slice(0, 7)),
        avisos,
      });
    }




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
      const cid = txt(pick(r, COMPANY_ID_KEYS)) ?? '';
      if (seen.has(cid)) { dupAtivos++; continue; }
      seen.add(cid);
      const linha = mapAtivo(r, {
        dataSnapshot,
        mesRef,
        tipoSnapshot: 'diario',
        dataExecucao,
        coletadoEm,
        fonte: 'Dash 3 card 103 (edge function)',
      });
      if (!linha.email) semEmail++;
      ativos.push(linha);
    }


    // ---- Fonte 2: cancelados do mês ----
    const churnRaw = await metabase('/api/card/181/query/json', apiKey);
    const churnMes = churnRaw.filter((r) => String(r['Mes Ref Analise'] ?? '').startsWith(yearMonth));

    // ---- Fonte 2c: analítico de churn (metas_churn_daily) — reaproveita o card 181 ----
    const churnDailyBackfill = body.backfill === true;
    const churnDailyFonte = churnDailyBackfill
      ? churnRaw
      : churnRaw.filter((r) => String(r['Mes Ref Analise'] ?? '').startsWith(yearMonth));
    const churnDailyRows: Row[] = [];
    const churnDailyKeys = new Set<string>();
    let churnDailyDup = 0;
    let churnDailyInvalidas = 0;
    for (const r of churnDailyFonte) {
      const mapped = mapChurnDaily(r, dataExecucao, coletadoEm);
      if (!mapped) { churnDailyInvalidas++; continue; }
      const key = `${mapped.mes_ref}|${mapped.company_id}`;
      if (churnDailyKeys.has(key)) {
        // Não deduplicamos por regra; apenas reportamos e mantemos a última ocorrência.
        churnDailyDup++;
        const idx = churnDailyRows.findIndex((x) => `${x.mes_ref}|${x.company_id}` === key);
        if (idx >= 0) churnDailyRows[idx] = mapped;
        continue;
      }
      churnDailyKeys.add(key);
      churnDailyRows.push(mapped);
    }
    if (churnDailyDup > 0) {
      avisos.push(`${churnDailyDup} linha(s) duplicada(s) de (mes_ref, company_id) no analítico de churn (esperado 0).`);
    }
    if (churnDailyInvalidas > 0) {
      avisos.push(`${churnDailyInvalidas} linha(s) do analítico de churn sem Mes Ref Analise/Company ID foram ignoradas.`);
    }
    const churnDailyPorMes: Record<string, { linhas: number; mrr: number }> = {};
    for (const r of churnDailyRows) {
      const k = String(r.mes_ref);
      const acc = churnDailyPorMes[k] ?? { linhas: 0, mrr: 0 };
      acc.linhas++;
      acc.mrr = Number((acc.mrr + (Number(r.total_mrr) || 0)).toFixed(2));
      churnDailyPorMes[k] = acc;
    }

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
      churn_daily: {
        backfill: churnDailyBackfill,
        lidos: churnDailyFonte.length,
        linhas: churnDailyRows.length,
        duplicadas_encontradas: churnDailyDup,
        ignoradas_sem_chave: churnDailyInvalidas,
        por_mes: churnDailyPorMes,
      },
      avisos,
    };

    if (dryRun) {
      return json({ ...base, gravados: { ativo: 0, cancelado: 0, trial: 0, churn_historico: 0, churn_daily: 0 } });
    }

    const gravados = { ativo: 0, cancelado: 0, trial: 0, churn_historico: 0, churn_daily: 0 };
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

    // Analítico de churn (metas_churn_daily). visto_primeira_vez_em é gravado
    // apenas na inserção — nunca sobrescrito em update.
    if (churnDailyRows.length > 0) {
      const existentes = new Set<string>();
      const meses = Array.from(new Set(churnDailyRows.map((r) => String(r.mes_ref))));
      for (let i = 0; i < meses.length; i += 50) {
        const fatia = meses.slice(i, i + 50);
        const { data, error } = await supabase
          .from('metas_churn_daily')
          .select('mes_ref, company_id')
          .in('mes_ref', fatia);
        if (error) {
          avisos.push(`Falha ao ler chaves existentes de metas_churn_daily: ${error.message}`);
          break;
        }
        for (const row of data ?? []) existentes.add(`${row.mes_ref}|${row.company_id}`);
      }

      const novas = churnDailyRows
        .filter((r) => !existentes.has(`${r.mes_ref}|${r.company_id}`))
        .map((r) => ({ ...r, visto_primeira_vez_em: dataExecucao }));
      const atualizadas = churnDailyRows.filter((r) => existentes.has(`${r.mes_ref}|${r.company_id}`));

      for (const conjunto of [novas, atualizadas]) {
        for (let i = 0; i < conjunto.length; i += BATCH) {
          const chunk = conjunto.slice(i, i + BATCH);
          const { error } = await supabase
            .from('metas_churn_daily')
            .upsert(chunk, { onConflict: 'mes_ref,company_id', ignoreDuplicates: false });
          if (error) {
            avisos.push(`Falha ao gravar analítico de churn (lote ${i / BATCH + 1}): ${error.message}`);
            break;
          }
          gravados.churn_daily += chunk.length;
        }
      }
    }

    return json({ ...base, gravados });

  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    return json({ error: (e as Error)?.message ?? String(e) }, status);
  }
});
