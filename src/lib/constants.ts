export const STAGE_LABELS: Record<string, string> = {
  novo_lead: "Novo Lead",
  contato_realizado: "Contato Realizado",
  diagnostico: "Diagnóstico/Reunião",
  proposta_enviada: "Proposta Enviada",
  negociacao: "Negociação",
  fechado_won: "Fechado (Won)",
  perdido: "Perdido",
};

export const STAGE_ORDER = [
  "novo_lead", "contato_realizado", "diagnostico",
  "proposta_enviada", "negociacao", "fechado_won", "perdido",
] as const;

export const ACTIVE_STAGES = STAGE_ORDER.filter(s => s !== "fechado_won" && s !== "perdido");

export const ORIGIN_LABELS: Record<string, string> = {
  freetrial: "Free Trial",
  cursos: "Cursos",
  outbound: "Outbound",
  campanhas: "Campanhas",
  base: "Base",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  mensagem_enviada: "Mensagem Enviada",
  resposta_recebida: "Resposta Recebida",
  call_realizada: "Call Realizada",
  reuniao_executada: "Reunião Executada",
};

export const STAGE_WEIGHTS: Record<string, number> = {
  novo_lead: 0.05,
  contato_realizado: 0.15,
  diagnostico: 0.30,
  proposta_enviada: 0.50,
  negociacao: 0.75,
  fechado_won: 1.0,
  perdido: 0,
};
