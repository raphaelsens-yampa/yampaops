import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  attainmentPct,
  campaignLabel,
  formatMetricValue,
  formatPct,
  groupBySection,
  variationPct,
  type HistoryCampaign,
  type HistoryMetric,
  type HistoryValue,
} from "@/lib/campaignHistory";

type ValueMap = Map<string, HistoryValue>;

const keyOf = (campaignId: string, metricId: string) => `${campaignId}|${metricId}`;

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(subtitle, 14, 25);
    doc.setTextColor(0);
  }
}

function lastY(doc: jsPDF, fallback: number) {
  return (doc as any).lastAutoTable?.finalY ?? fallback;
}

export interface PdfOptions {
  campaign?: HistoryCampaign | null;
  compareA?: HistoryCampaign | null;
  compareB?: HistoryCampaign | null;
  evolutionCampaigns?: HistoryCampaign[];
  evolutionMetricIds?: string[];
  chartImages?: string[];
}

export function buildCampaignHistoryPdf(
  metrics: HistoryMetric[],
  values: ValueMap,
  opts: PdfOptions,
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");
  let firstPage = true;

  const newPage = () => {
    if (!firstPage) doc.addPage();
    firstPage = false;
  };

  // ===== Painel da campanha =====
  if (opts.campaign) {
    newPage();
    header(doc, `Histórico de Campanhas — ${campaignLabel(opts.campaign)}`, `Gerado em ${today}`);
    const body: any[] = [];
    for (const group of groupBySection(metrics)) {
      body.push([{ content: group.section, colSpan: 6, styles: { fontStyle: "bold", fillColor: [235, 238, 242] } }]);
      for (const m of group.metrics) {
        const v = values.get(keyOf(opts.campaign.id, m.id));
        const pct = attainmentPct(v?.target_value, v?.actual_value);
        body.push([
          m.label,
          formatMetricValue(v?.target_value ?? null, m.unit),
          formatMetricValue(v?.actual_value ?? null, m.unit),
          formatPct(pct),
          m.is_funnel ? formatPct(v?.funnel_target_pct ?? null) : "",
          m.is_funnel ? formatPct(v?.funnel_actual_pct ?? null) : "",
        ]);
      }
    }
    autoTable(doc, {
      startY: 32,
      head: [["Indicador", "Meta Atual", "Realizado Atual", "% Ating. Meta", "% Meta Funil", "% Realizado Funil"]],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [1, 184, 224] },
      columnStyles: { 0: { cellWidth: 55 } },
    });
  }

  // ===== Comparativo A x B =====
  if (opts.compareA && opts.compareB) {
    newPage();
    header(
      doc,
      "Comparativo de campanhas",
      `${campaignLabel(opts.compareA)}  x  ${campaignLabel(opts.compareB)}`,
    );
    const body = metrics.map((m) => {
      const a = values.get(keyOf(opts.compareA!.id, m.id));
      const b = values.get(keyOf(opts.compareB!.id, m.id));
      const varPct = variationPct(a?.actual_value ?? null, b?.actual_value ?? null);
      return [
        m.label,
        formatMetricValue(a?.target_value ?? null, m.unit),
        formatMetricValue(a?.actual_value ?? null, m.unit),
        formatMetricValue(b?.target_value ?? null, m.unit),
        formatMetricValue(b?.actual_value ?? null, m.unit),
        varPct === null ? "—" : `${varPct > 0 ? "+" : ""}${varPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
      ];
    });
    autoTable(doc, {
      startY: 32,
      head: [["Indicador", "Meta A", "Realizado A", "Meta B", "Realizado B", "Var. Realizado"]],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [45, 9, 76] },
      columnStyles: { 0: { cellWidth: 55 } },
    });
  }

  // ===== Evolução histórica =====
  const evo = opts.evolutionCampaigns ?? [];
  const evoMetrics = metrics.filter((m) => (opts.evolutionMetricIds ?? []).includes(m.id));
  if (evo.length && evoMetrics.length) {
    newPage();
    header(doc, "Evolução histórica", `${evo.length} campanhas · ${evoMetrics.length} indicadores`);
    autoTable(doc, {
      startY: 32,
      head: [["Indicador", ...evo.map((c) => campaignLabel(c))]],
      body: evoMetrics.map((m) => [
        m.label,
        ...evo.map((c) => formatMetricValue(values.get(keyOf(c.id, m.id))?.actual_value ?? null, m.unit)),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [1, 184, 224] },
    });
  }

  for (const img of opts.chartImages ?? []) {
    newPage();
    const width = 182;
    doc.addImage(img, "PNG", 14, 20, width, 0);
  }

  return doc;
}
