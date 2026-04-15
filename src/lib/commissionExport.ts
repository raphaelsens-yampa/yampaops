import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface ExportRow {
  cliente: string;
  empresa: string;
  plano: string;
  mrr: number;
  comissao: number;
  tipo: string;
  status: string;
  dataVenda: string;
  mesGeracao: string;
  mesPagamento: string;
  vendedor?: string;
}

const statusLabel: Record<string, string> = {
  provisioned: "Provisionado",
  paid: "Pago",
  reversed: "Estornado",
};

const typeLabel: Record<string, string> = {
  earned: "Ganho",
  clawback: "Estorno",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function exportCommissionsPDF(rows: ExportRow[], title: string, monthLabel: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(`${title} — ${monthLabel}`, 14, 18);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 14, 24);

  const headers = rows[0]?.vendedor !== undefined
    ? ["Cliente", "Empresa", "Vendedor", "Plano", "MRR", "Comissão", "Tipo", "Status", "Data Venda", "Mês Geração", "Mês Pagamento"]
    : ["Cliente", "Empresa", "Plano", "MRR", "Comissão", "Tipo", "Status", "Data Venda", "Mês Geração", "Mês Pagamento"];

  const body = rows.map((r) => {
    const base = [
      r.cliente, r.empresa,
      ...(r.vendedor !== undefined ? [r.vendedor] : []),
      r.plano, fmt(r.mrr), fmt(r.comissao),
      typeLabel[r.tipo] || r.tipo, statusLabel[r.status] || r.status,
      r.dataVenda, r.mesGeracao, r.mesPagamento,
    ];
    return base;
  });

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [5, 32, 51] },
  });

  const totalComissao = rows.reduce((s, r) => s + (r.tipo === "clawback" ? -r.comissao : r.comissao), 0);
  const totalMrr = rows.reduce((s, r) => s + r.mrr, 0);
  const finalY = (doc as any).lastAutoTable?.finalY || 40;
  doc.setFontSize(10);
  doc.text(`Total MRR: ${fmt(totalMrr)}  |  Total Comissão Líquida: ${fmt(totalComissao)}`, 14, finalY + 8);

  doc.save(`comissoes_${monthLabel.replace(/\s/g, "_")}.pdf`);
}

export function exportCommissionsXLSX(rows: ExportRow[], title: string, monthLabel: string) {
  const hasVendedor = rows[0]?.vendedor !== undefined;
  const data = rows.map((r) => ({
    Cliente: r.cliente,
    Empresa: r.empresa,
    ...(hasVendedor ? { Vendedor: r.vendedor } : {}),
    Plano: r.plano,
    "MRR (R$)": r.mrr,
    "Comissão (R$)": r.comissao,
    Tipo: typeLabel[r.tipo] || r.tipo,
    Status: statusLabel[r.status] || r.status,
    "Data Venda": r.dataVenda,
    "Mês Geração MRR": r.mesGeracao,
    "Mês Pagamento": r.mesPagamento,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comissões");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `comissoes_${monthLabel.replace(/\s/g, "_")}.xlsx`);
}
