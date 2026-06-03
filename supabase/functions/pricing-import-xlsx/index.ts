import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import ExcelJS from 'npm:exceljs@4.4.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function num(v: any, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function str(v: any): string {
  return v == null ? '' : String(v).trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { xlsx_base64, filename } = await req.json();
    if (!xlsx_base64) throw new Error('xlsx_base64 obrigatório');
    const bin = Uint8Array.from(atob(xlsx_base64), (c) => c.charCodeAt(0));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bin.buffer);

    const snap: any = {
      version: 1,
      currency: 'BRL',
      capacity: { people: 1, hours_per_day: 8, work_days: 220, productivity_pct: 0.85 },
      fixed_costs: [],
      labor_costs: [],
      markup_lines: {
        premium: { tax_pct: 0.08, commission_pct: 0.1, gateway_pct: 0.05, investment_pct: 0.06, sales_commission_pct: 0.0134, fixed_expense_pct: 0.168, churn_pct: 0.06, profit_pct: 0.3 },
        gold: { tax_pct: 0.08, commission_pct: 0.1, gateway_pct: 0.05, investment_pct: 0.06, sales_commission_pct: 0.0134, fixed_expense_pct: 0.168, churn_pct: 0.06, profit_pct: 0.2 },
        prata: { tax_pct: 0.08, commission_pct: 0.1, gateway_pct: 0.05, investment_pct: 0.06, sales_commission_pct: 0.0134, fixed_expense_pct: 0.168, churn_pct: 0.06, profit_pct: 0.1 },
      },
      inputs: [],
      subproducts: [],
      services: [],
    };

    const wsCap = wb.getWorksheet('Capacidade');
    if (wsCap) {
      snap.capacity = {
        people: num(wsCap.getCell('B1').value, 1),
        hours_per_day: num(wsCap.getCell('B2').value, 8),
        work_days: num(wsCap.getCell('B3').value, 220),
        productivity_pct: num(wsCap.getCell('B4').value, 0.85),
      };
    }
    const wsFx = wb.getWorksheet('Custo Fixo');
    if (wsFx) wsFx.eachRow((row, idx) => {
      if (idx === 1) return;
      const desc = str(row.getCell(1).value);
      const amount = num(row.getCell(2).value);
      if (desc && amount > 0) snap.fixed_costs.push({ description: desc, amount });
    });
    const wsLb = wb.getWorksheet('Mão de Obra');
    if (wsLb) wsLb.eachRow((row, idx) => {
      if (idx === 1) return;
      const desc = str(row.getCell(1).value);
      const amount = num(row.getCell(2).value);
      if (desc && amount > 0) snap.labor_costs.push({ description: desc, amount });
    });
    const wsMk = wb.getWorksheet('Markup');
    if (wsMk) wsMk.eachRow((row, idx) => {
      if (idx === 1) return;
      const line = str(row.getCell(1).value).toLowerCase();
      if (!['premium','gold','prata'].includes(line)) return;
      snap.markup_lines[line] = {
        tax_pct: num(row.getCell(2).value),
        commission_pct: num(row.getCell(3).value),
        gateway_pct: num(row.getCell(4).value),
        investment_pct: num(row.getCell(5).value),
        sales_commission_pct: num(row.getCell(6).value),
        fixed_expense_pct: num(row.getCell(7).value),
        churn_pct: num(row.getCell(8).value),
        profit_pct: num(row.getCell(9).value),
      };
    });
    const wsIn = wb.getWorksheet('Insumos');
    if (wsIn) wsIn.eachRow((row, idx) => {
      if (idx === 1) return;
      snap.inputs.push({
        id: str(row.getCell(1).value) || `inp_${idx}`,
        name: str(row.getCell(2).value),
        minutes: num(row.getCell(3).value),
        unit: str(row.getCell(4).value) || 'Minuto',
      });
    });
    const wsSp = wb.getWorksheet('Subprodutos');
    if (wsSp) wsSp.eachRow((row, idx) => {
      if (idx === 1) return;
      let items: any[] = [];
      try { items = JSON.parse(str(row.getCell(3).value) || '[]'); } catch (_) { items = []; }
      snap.subproducts.push({
        id: str(row.getCell(1).value) || `sub_${idx}`,
        name: str(row.getCell(2).value),
        items,
        cached_cost: num(row.getCell(4).value),
      });
    });
    const wsSv = wb.getWorksheet('Serviços');
    if (wsSv) wsSv.eachRow((row, idx) => {
      if (idx === 1) return;
      let recipe: any[] = [];
      try { recipe = JSON.parse(str(row.getCell(7).value) || '[]'); } catch (_) { recipe = []; }
      const line = str(row.getCell(4).value).toLowerCase();
      snap.services.push({
        id: str(row.getCell(1).value) || `srv_${idx}`,
        name: str(row.getCell(2).value),
        contract_months: num(row.getCell(3).value, 1),
        line: ['premium','gold','prata'].includes(line) ? line : 'gold',
        practiced_price: num(row.getCell(5).value),
        qty_sold: num(row.getCell(6).value),
        recipe,
        active: row.getCell(8).value !== false,
      });
    });

    const auth = req.headers.get('Authorization');
    let createdBy: string | null = null;
    if (auth?.startsWith('Bearer ')) {
      const sbUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: auth } },
      });
      const { data } = await sbUser.auth.getUser();
      createdBy = data.user?.id ?? null;
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await sb.from('pricing_versions').insert({
      name: `Importação: ${filename ?? 'XLSX'} (${new Date().toLocaleString('pt-BR')})`,
      description: 'Versão criada a partir de importação de planilha XLSX',
      status: 'draft',
      source: 'import',
      snapshot: snap,
      created_by: createdBy,
    }).select('id').single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, version_id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
