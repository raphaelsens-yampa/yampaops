export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "cold_call", label: "Cold Call" },
  { value: "ads", label: "Ads" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "evento", label: "Evento" },
  { value: "outros", label: "Outros" },
];

export const STATUS_OPTIONS = [
  { value: "planejada", label: "Planejada" },
  { value: "ativa", label: "Ativa" },
  { value: "pausada", label: "Pausada" },
  { value: "concluida", label: "Concluída" },
];

export const CONTACT_STATUS_OPTIONS = [
  { value: "nao_trabalhado", label: "Não trabalhado" },
  { value: "contatado", label: "Contatado" },
  { value: "respondeu", label: "Respondeu" },
  { value: "agendado", label: "Agendado" },
  { value: "convertido", label: "Convertido" },
  { value: "descartado", label: "Descartado" },
];

type CampaignAggregate = {
  base: number;
  contacted: number;
  replies: number;
  meetings?: number;
  conversions: number;
  mrr: number;
};

export function sumSnapshotMetrics<T extends {
  contacted?: number | string | null;
  replies?: number | string | null;
  meetings?: number | string | null;
  conversions?: number | string | null;
  mrr_generated?: number | string | null;
}>(snapshots: T[]) {
  return snapshots.reduce(
    (acc, snapshot) => ({
      contacted: acc.contacted + (Number(snapshot.contacted) || 0),
      replies: acc.replies + (Number(snapshot.replies) || 0),
      meetings: acc.meetings + (Number(snapshot.meetings) || 0),
      conversions: acc.conversions + (Number(snapshot.conversions) || 0),
      mrr: acc.mrr + (Number(snapshot.mrr_generated) || 0),
    }),
    { contacted: 0, replies: 0, meetings: 0, conversions: 0, mrr: 0 },
  );
}

export function mergeCampaignProgress(baseAggregate: CampaignAggregate, snapshotTotals?: Partial<CampaignAggregate>) {
  if (!snapshotTotals) return baseAggregate;

  return {
    ...baseAggregate,
    contacted: Math.max(baseAggregate.contacted, Number(snapshotTotals.contacted) || 0),
    replies: Math.max(baseAggregate.replies, Number(snapshotTotals.replies) || 0),
    meetings: Math.max(baseAggregate.meetings || 0, Number(snapshotTotals.meetings) || 0),
    conversions: Math.max(baseAggregate.conversions, Number(snapshotTotals.conversions) || 0),
    mrr: Math.max(baseAggregate.mrr, Number(snapshotTotals.mrr) || 0),
  };
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case "ativa": return "bg-success/15 text-success";
    case "planejada": return "bg-muted text-muted-foreground";
    case "pausada": return "bg-warning/15 text-warning";
    case "concluida": return "bg-secondary/15 text-secondary";
    case "convertido": return "bg-success/15 text-success";
    case "respondeu": case "agendado": return "bg-primary/15 text-primary";
    case "descartado": return "bg-destructive/15 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}
