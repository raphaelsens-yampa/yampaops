import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { WeeklyReport } from "./useWeeklyReport";

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pctTxt = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
export const dBR = (s: string) => s.split("-").reverse().join("/");

/** Tabelas comuns a PDF, Excel e Google Apresentações. */
export function reportSections(r: WeeklyReport, notes: { highlights: string; risks: string; actions: string }) {
  const m = r.monthly, w = r.weekly;
  const line = (label: string, p: { goal: number; realized: number; pct: number | null; expected: number; trend: number }) =>
    [label, brl(p.goal), brl(p.realized), pctTxt(p.pct), brl(p.expected), brl(p.trend)];
  return [
    { title: "Resumo do mês — Meta x Realizado", head: ["Indicador", "Meta", "Realizado", "%", "Esperado hoje", "Tendência"], rows: [
      ["MRR total", brl(m.totalMrr.goal), brl(m.totalMrr.realized), pctTxt(m.totalMrr.goal ? m.totalMrr.realized / m.totalMrr.goal : null), "—", "—"],
      ["Usuários ativos", String(m.ativos.goal), String(m.ativos.realized), pctTxt(m.ativos.goal ? m.ativos.realized / m.ativos.goal : null), "—", "—"],
      line("New MRR", m.newMrr), line("· Novos", m.novos), line("· Recuperados", m.recuperados), line("· Upsell", m.upsell),
      line("Churn MRR", m.churn),
      ["NET MRR", brl(m.netGoal), brl(m.net), pctTxt(m.netGoal ? m.net / m.netGoal : null), "—", "—"],
      ["Vendas (qtd)", "—", String(m.qty), "—", "—", "—"],
    ] },
    { title: "Performance da semana", head: ["Indicador", "Semana", "Semana anterior", "Média 4 semanas"], rows: [
      ["Vendas (qtd)", String(w.cur.qty), String(w.prev.qty), String(Math.round(w.avg4.qty))],
      ["New MRR", brl(w.cur.newMrr), brl(w.prev.newMrr), brl(w.avg4.newMrr)],
      ["· Novos", brl(w.cur.novos), brl(w.prev.novos), brl(w.avg4.novos)],
      ["· Recuperados", brl(w.cur.recuperados), brl(w.prev.recuperados), brl(w.avg4.recuperados)],
      ["· Upsell", brl(w.cur.upsell), brl(w.prev.upsell), brl(w.avg4.upsell)],
      ["Churn MRR", brl(w.churn.mrr), brl(w.prevChurn.mrr), "—"],
      ["Saldo", brl(w.cur.newMrr - w.churn.mrr), brl(w.prev.newMrr - w.prevChurn.mrr), "—"],
    ] },
    { title: "Dia a dia da semana", head: ["Dia", "Meta New MRR", "Realizado", "Vendas"], rows: w.days.map((d) => [dBR(d.day), brl(d.goal), brl(d.realized), String(d.qty)]) },
    { title: "Times — semana e mês", head: ["Área", "MRR semana", "Vendas semana", "MRR mês", "Vendas mês"], rows: r.areas.month.map((a) => {
      const wk = r.areas.week.find((x) => x.key === a.key); return [a.key, brl(wk?.mrr || 0), String(wk?.qty || 0), brl(a.mrr), String(a.qty)]; }) },
    { title: "Ranking de vendedores (mês)", head: ["Vendedor", "MRR semana", "Vendas semana", "MRR mês", "Vendas mês"], rows: r.sellers.month.slice(0, 10).map((a) => {
      const wk = r.sellers.week.find((x) => x.key === a.key); return [a.key, brl(wk?.mrr || 0), String(wk?.qty || 0), brl(a.mrr), String(a.qty)]; }) },
    { title: "Campanhas do mês", head: ["Campanha", "Período", "MRR projetado", "Vendas projetadas"], rows: [
      ...r.campaigns.projections.map((p: any) => [p.name || "Campanha", `${dBR(p.start_date)} a ${dBR(p.end_date)}`, brl(Number(p.mrr || 0)), String(p.qty || 0)]),
      ["Realizado com campanha", "Mês até hoje", brl(r.campaigns.realized.newMrr), String(r.campaigns.realized.qty)],
      ["Realizado sem campanha", "Mês até hoje", brl(r.campaigns.nonCampaign), "—"],
    ] },
    { title: "Riscos e previsão", head: ["Indicador", "Valor"], rows: [
      ["NET MRR projetado no fechamento", brl(r.risks.projectedNet)],
      ["Pré-churn próximos 7 dias", `${r.risks.preChurnCount} clientes · ${brl(r.risks.preChurnMrr)}`],
      ["RD Station — negociações abertas", `${r.risks.rdOpen} · ${brl(r.risks.rdOpenValue)}`],
      ["RD Station — novas na semana", String(r.risks.rdNewWeek)],
      ["RD Station — ganhas na semana", String(r.risks.rdWonWeek)],
    ] },
    { title: "Comentários da semana", head: ["Tema", "Texto"], rows: [["Destaques", notes.highlights || "—"], ["Riscos", notes.risks || "—"], ["Ações", notes.actions || "—"]] },
  ];
}

export function reportTitle(r: WeeklyReport) { return `Report Comercial — semana ${dBR(r.week.start)} a ${dBR(r.week.end)}`; }
export function reportSubtitle(r: WeeklyReport, originLabel: string) {
  return `${originLabel} · gerado em ${new Date(r.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · última foto do Metabase: ${r.snapshotDate ? dBR(r.snapshotDate) : "—"}`;
}

export function exportExcel(r: WeeklyReport, notes: any, originLabel: string) {
  const wb = XLSX.utils.book_new();
  reportSections(r, notes).forEach((s, i) => {
    const ws = XLSX.utils.aoa_to_sheet([[reportTitle(r)], [reportSubtitle(r, originLabel)], [], s.head, ...s.rows]);
    XLSX.utils.book_append_sheet(wb, ws, `${i + 1} ${s.title}`.replace(/[\\/?*[\]:]/g, "").slice(0, 31));
  });
  XLSX.writeFile(wb, `report-semanal-${r.week.start}.xlsx`);
}

export function exportPdf(r: WeeklyReport, notes: any, originLabel: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  reportSections(r, notes).forEach((s, i) => {
    if (i) doc.addPage();
    doc.setFontSize(16); doc.text(reportTitle(r), 14, 16);
    doc.setFontSize(9); doc.text(reportSubtitle(r, originLabel), 14, 22);
    doc.setFontSize(13); doc.text(s.title, 14, 32);
    autoTable(doc, { startY: 36, head: [s.head], body: s.rows, headStyles: { fillColor: [45, 9, 76] }, styles: { fontSize: 10 } });
  });
  doc.save(`report-semanal-${r.week.start}.pdf`);
}
