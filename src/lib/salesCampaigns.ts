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
