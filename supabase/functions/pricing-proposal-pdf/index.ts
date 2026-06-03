import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsPDF } from 'npm:jspdf@2.5.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { proposal_id } = await req.json();
    if (!proposal_id) throw new Error('proposal_id obrigatório');

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: p, error } = await sb
      .from('pricing_proposals')
      .select('*, pricing_versions(name)')
      .eq('id', proposal_id)
      .maybeSingle();
    if (error || !p) throw new Error(error?.message || 'Proposta não encontrada');

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    let y = 0;

    // Capa colorida (Yampa primary: #01B8E0)
    doc.setFillColor(45, 9, 76); // secondary
    doc.rect(0, 0, W, 70, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('Proposta Comercial', 15, 35);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Yampa · ${new Date(p.created_at).toLocaleDateString('pt-BR')}`, 15, 45);
    doc.setFillColor(1, 184, 224); // primary
    doc.rect(0, 70, W, 4, 'F');

    y = 88;
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(p.client_name, 35, y);
    y += 6;
    if (p.client_doc) { doc.text(`Documento: ${p.client_doc}`, 15, y); y += 6; }
    if (p.client_email) { doc.text(`E-mail: ${p.client_email}`, 15, y); y += 6; }
    if (p.client_phone) { doc.text(`Telefone: ${p.client_phone}`, 15, y); y += 6; }

    // Resumo
    if (p.executive_summary) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo executivo', 15, y); y += 6;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(p.executive_summary, W - 30);
      doc.text(lines, 15, y); y += lines.length * 5;
    }

    // Tabela itens
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(245, 245, 250);
    doc.rect(15, y - 4, W - 30, 8, 'F');
    doc.text('Serviço', 17, y + 1);
    doc.text('Qty', 110, y + 1);
    doc.text('Mensal', 130, y + 1, { align: 'right' });
    doc.text('Total', W - 17, y + 1, { align: 'right' });
    y += 8;
    doc.setFont('helvetica', 'normal');

    const items: any[] = Array.isArray(p.items) ? p.items : [];
    for (const it of items) {
      const lines = doc.splitTextToSize(it.name, 90);
      doc.text(lines, 17, y);
      doc.text(String(it.qty), 110, y);
      doc.text(BRL(it.unit_monthly * it.qty), 130, y, { align: 'right' });
      doc.text(BRL(it.unit_total * it.qty), W - 17, y, { align: 'right' });
      y += Math.max(6, lines.length * 5);
      doc.setDrawColor(230); doc.line(15, y - 2, W - 15, y - 2);
    }

    // Totais
    y += 4;
    doc.setFont('helvetica', 'bold');
    if (Number(p.discount_pct) > 0) {
      doc.text(`Desconto: ${p.discount_pct}%`, W - 17, y, { align: 'right' });
      y += 6;
    }
    doc.setFontSize(13);
    doc.text(`Mensal: ${BRL(p.total_monthly)}`, W - 17, y, { align: 'right' }); y += 7;
    doc.setFontSize(15);
    doc.setTextColor(1, 184, 224);
    doc.text(`Total do contrato: ${BRL(p.total_annual)}`, W - 17, y, { align: 'right' }); y += 10;
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);

    // Condições
    if (p.payment_terms) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.text('Condições', 15, y); y += 6;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(p.payment_terms, W - 30);
      doc.text(lines, 15, y); y += lines.length * 5;
    }
    if (p.valid_until) {
      y += 4;
      doc.text(`Proposta válida até: ${new Date(p.valid_until).toLocaleDateString('pt-BR')}`, 15, y);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Versão de precificação: ${p.pricing_versions?.name ?? '—'} · ID ${p.id.slice(0, 8)}`, 15, 290);

    const b64 = doc.output('datauristring').split(',')[1];
    return new Response(JSON.stringify({ pdf_base64: b64 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
