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

// SaaS benchmark conversion rates (market defaults)
export const SAAS_BENCHMARKS = {
  prospeccao_resposta: 0.10,
  resposta_agendamento: 0.25,
  agendamento_comparecimento: 0.70,
  comparecimento_conversao: 0.30,
};

// Funnel transition definitions mapping DB stages
export const FUNNEL_TRANSITIONS = [
  {
    key: "prospeccao_resposta",
    label: "Prospecção → Resposta",
    from: "novo_lead",
    to: "contato_realizado",
    benchmarkKey: "prospeccao_resposta" as keyof typeof SAAS_BENCHMARKS,
  },
  {
    key: "resposta_agendamento",
    label: "Resposta → Agendamento",
    from: "contato_realizado",
    to: "diagnostico",
    benchmarkKey: "resposta_agendamento" as keyof typeof SAAS_BENCHMARKS,
  },
  {
    key: "agendamento_comparecimento",
    label: "Agendamento → Comparecimento",
    from: "diagnostico",
    to: "proposta_enviada",
    benchmarkKey: "agendamento_comparecimento" as keyof typeof SAAS_BENCHMARKS,
  },
  {
    key: "comparecimento_conversao",
    label: "Comparecimento → Conversão",
    from: "proposta_enviada",
    to: "fechado_won",
    benchmarkKey: "comparecimento_conversao" as keyof typeof SAAS_BENCHMARKS,
    includeNegociacao: true,
  },
] as const;
