import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import ExcelJS from 'npm:exceljs@4.4.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { version_id } = await req.json();
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: v, error } = await sb
      .from('pricing_versions').select('*').eq('id', version_id).maybeSingle();
    if (error || !v) throw new Error(error?.message || 'Versão não encontrada');

    const snap = v.snapshot as any;
    const wb = new ExcelJS.Workbook();

    const w1 = wb.addWorksheet('Capacidade');
    w1.addRows([
      ['Pessoas produtivas', snap.capacity.people],
      ['Horas/dia', snap.capacity.hours_per_day],
      ['Dias trabalhados/ano', snap.capacity.work_days],
      ['% Produtividade', snap.capacity.productivity_pct],
    ]);

    const w2 = wb.addWorksheet('Custo Fixo');
    w2.addRow(['Descrição', 'Valor R$']);
    (snap.fixed_costs ?? []).forEach((c: any) => w2.addRow([c.description, c.amount]));

    const w3 = wb.addWorksheet('Mão de Obra');
    w3.addRow(['Descrição', 'Valor R$']);
    (snap.labor_costs ?? []).forEach((c: any) => w3.addRow([c.description, c.amount]));

    const w4 = wb.addWorksheet('Markup');
    w4.addRow(['Linha', 'Imposto', 'Comissão', 'Gateway', 'Investimento', 'Com.Comercial', 'Despesa Fixa', 'Churn', 'Lucro']);
    for (const k of ['premium', 'gold', 'prata']) {
      const l = snap.markup_lines[k];
      w4.addRow([k, l.tax_pct, l.commission_pct, l.gateway_pct, l.investment_pct, l.sales_commission_pct, l.fixed_expense_pct, l.churn_pct, l.profit_pct]);
    }

    const w5 = wb.addWorksheet('Insumos');
    w5.addRow(['ID', 'Nome', 'Minutos', 'Unidade']);
    (snap.inputs ?? []).forEach((i: any) => w5.addRow([i.id, i.name, i.minutes, i.unit]));

    const w6 = wb.addWorksheet('Subprodutos');
    w6.addRow(['ID', 'Nome', 'Items (JSON)', 'Cached']);
    (snap.subproducts ?? []).forEach((s: any) => w6.addRow([s.id, s.name, JSON.stringify(s.items), s.cached_cost ?? '']));

    const w7 = wb.addWorksheet('Serviços');
    w7.addRow(['ID', 'Nome', 'Meses', 'Linha', 'Praticado Total', 'Qty Vendida', 'Recipe (JSON)', 'Ativo']);
    (snap.services ?? []).forEach((s: any) =>
      w7.addRow([s.id, s.name, s.contract_months, s.line, s.practiced_price, s.qty_sold, JSON.stringify(s.recipe), s.active]),
    );

    const buf = await wb.xlsx.writeBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
    return new Response(JSON.stringify({ xlsx_base64: b64 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
