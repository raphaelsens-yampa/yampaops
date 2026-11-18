// Distinção visual entre funis vindos do ActiveCampaign e do RD Station.
// A origem mora na coluna `crm_source` de `ac_funnels`: "rd" para RD Station,
// "activecampaign" (padrão da coluna) para os funis antigos do ActiveCampaign.

export const AC_FUNNEL_SOURCE = "activecampaign";
export const RD_FUNNEL_SOURCE = "rd";

/** "RD" para funis do RD Station; "AC" para os demais (ActiveCampaign, inclusive quando a origem está ausente). */
export function funnelSourceTag(crmSource?: string | null): "AC" | "RD" {
  return String(crmSource ?? "").trim().toLowerCase() === RD_FUNNEL_SOURCE ? "RD" : "AC";
}

/** Nome do funil com a marca de origem na frente: "(AC) [Sales] Time Financeiro" / "(RD) Outbound". */
export function funnelLabel(title?: string | null, crmSource?: string | null): string {
  return `(${funnelSourceTag(crmSource)}) ${title ?? "—"}`;
}
