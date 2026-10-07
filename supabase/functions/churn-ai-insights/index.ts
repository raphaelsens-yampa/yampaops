import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TOOL = {
  type: 'function',
  function: {
    name: 'churn_playbook',
    description: 'Diagnóstico de padrões de churn e plano de ação para o CS',
    parameters: {
      type: 'object',
      properties: {
        resumo: { type: 'string', description: 'Diagnóstico executivo em 3-5 frases' },
        padroes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              evidencia: { type: 'string', description: 'Números que sustentam o padrão' },
              impacto: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
            },
            required: ['titulo', 'evidencia', 'impacto'],
          },
        },
        acoes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              publico: { type: 'string', description: 'Motivo/segmento/tipo alvo' },
              acao: { type: 'string' },
              argumento: { type: 'string', description: 'Frase/argumento sugerido para a conversa' },
              oferta: { type: 'string', description: 'Oferta ou concessão sugerida, se houver' },
              prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            },
            required: ['publico', 'acao', 'argumento', 'prioridade'],
          },
        },
        clientes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              risco: { type: 'string', description: 'Resumo do risco em 1 frase' },
              abordagem: { type: 'string', description: 'Abordagem sugerida em 1-2 frases' },
            },
            required: ['email', 'risco', 'abordagem'],
          },
        },
      },
      required: ['resumo', 'padroes', 'acoes', 'clientes'],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const auth = req.headers.get('authorization') || '';
    const { data: u } = await supabase.auth.getUser(auth.replace(/^bearer /i, '').trim());
    if (!u?.user) return json({ error: 'Unauthorized' }, 401);
    const { data: ok } = await supabase.rpc('is_tatico_or_admin', { _user_id: u.user.id });
    if (ok !== true) return json({ error: 'Forbidden' }, 403);

    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) return json({ error: 'LOVABLE_API_KEY ausente' }, 500);
    const body = await req.json();
    const { period_from, period_to, stats, clientes } = body ?? {};

    const prompt = `Você é especialista em Customer Success de SaaS B2B (software financeiro para PMEs, Brasil).
Analise os dados de pré-churn (voluntário = pedido de cancelamento com motivo; involuntário = inadimplência, vira churn se não pagar em 14 dias do vencimento) e desfechos (revertido/churn/em risco).
Identifique padrões acionáveis, proponha ações concretas para o time de CS (com argumentos de conversa em PT-BR) e uma abordagem para cada cliente em risco listado.
Período: ${period_from} a ${period_to}.
Estatísticas agregadas:
${JSON.stringify(stats).slice(0, 18000)}
Clientes em risco agora (prioridade por MRR e prazo):
${JSON.stringify(clientes ?? []).slice(0, 8000)}`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        tools: [TOOL],
        tool_choice: { type: 'function', function: { name: 'churn_playbook' } },
      }),
    });
    if (res.status === 402) return json({ error: 'Créditos de IA esgotados. Adicione créditos no workspace.' }, 402);
    if (res.status === 429) return json({ error: 'Limite de uso da IA atingido. Tente em alguns minutos.' }, 429);
    if (!res.ok) return json({ error: `IA falhou [${res.status}]` }, 502);
    const out = await res.json();
    const args = out?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ error: 'Resposta da IA vazia' }, 502);
    const insights = JSON.parse(args);

    const { data, error } = await supabase
      .from('churn_ai_insights')
      .insert({ scope: 'geral', period_from, period_to, insights, generated_by: u.user.id })
      .select()
      .single();
    if (error) return json({ error: error.message }, 500);
    return json(data);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
