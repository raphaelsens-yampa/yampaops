// Lista oficial de funcionalidades × Nível de Acesso × Papel.
// TODA nova tela, aba ou ação sensível precisa ser cadastrada aqui
// (o teste accessRegistry.test.ts falha se uma rota/menu usar área não cadastrada).
//
// Regra única: acesso = Nível de Acesso libera (view/create/edit) E papel >= minRole.
// Admin sempre tem tudo. Sub-áreas com `parent` herdam a permissão da área mãe
// enquanto o nível não tiver a chave própria configurada.

export type AppRoleKey = "admin" | "tatico" | "seller";

export const ROLE_RANK: Record<AppRoleKey, number> = { seller: 1, tatico: 2, admin: 3 };
export const ROLE_LABEL: Record<AppRoleKey, string> = { admin: "Admin", tatico: "Tático", seller: "Vendedor" };

type AreaDef = {
  key: string;
  label: string;
  route?: string;
  minRole?: AppRoleKey;
  parent?: string;
  readOnly?: boolean;
};

export const CRM_SECTIONS = [
  {
    key: "overview",
    label: "Visão Geral",
    areas: [
      { key: "one_page_diretoria", label: "OnePage Diretoria", route: "/one-page-diretoria" },
      { key: "goals", label: "Metas", route: "/goals" },
      { key: "goals_strategic", label: "Metas — Estratégicas", parent: "goals" },
      { key: "goals_strategic_mrr_refresh", label: "Metas Estratégicas — Atualizar MRR BPO/Vindi agora", parent: "goals_strategic", minRole: "tatico" },
      { key: "goals_tactical", label: "Metas — Táticas", parent: "goals" },
      { key: "goals_pacing", label: "Metas Táticas — Pacing New MRR e Churn", parent: "goals_tactical" },
      { key: "goals_operational_sales", label: "Metas Operacionais — Sales" },
      { key: "goals_operational_cs", label: "Metas Operacionais — CS" },
      { key: "goals_projected", label: "Metas — Resultado Projetado", parent: "goals_operational_sales" },
      { key: "goals_registry", label: "Metas — Cadastro de Metas", parent: "goals", minRole: "tatico" },
      { key: "goals_settings", label: "Metas — Configurações", parent: "goals", minRole: "tatico" },
      { key: "goals_weekly_report", label: "Metas — Report Semanal (Diretoria)", parent: "goals", minRole: "admin" },
      { key: "conversions", label: "Conversões por Área", route: "/insights/conversions", minRole: "tatico" },
      { key: "reports", label: "Relatórios", route: "/reports" },
    ],
  },
  {
    key: "operations",
    label: "Operações",
    areas: [
      { key: "atendimentos", label: "Atendimentos", route: "/atendimentos", minRole: "tatico" },
      { key: "agent_activity", label: "Atividade de Agentes", route: "/atividade-agentes", minRole: "tatico" },
      { key: "auditoria_ia", label: "Auditoria IA", route: "/atendimentos/auditoria" },
      { key: "auditoria_ia_admin", label: "Auditoria IA — Insights", route: "/atendimentos/auditoria/insights", minRole: "tatico" },
      { key: "auditoria_ia_config", label: "Auditoria IA — Revisão/Golden Set/Config", parent: "auditoria_ia_admin", minRole: "admin" },
      { key: "voz_do_cliente", label: "Voz do Cliente (temas e dores)", route: "/atendimentos/voz-do-cliente" },
      { key: "engajamento_cs", label: "Engajamento CS", route: "/atendimentos/engajamento-cs" },
      { key: "carteira_cs", label: "Carteira de CS (low-touch)", route: "/atendimentos/carteira-cs" },
      { key: "cs_queue", label: "Carteira de CS — Fila do dia", parent: "carteira_cs" },
      { key: "cs_tasks", label: "Carteira de CS — Tarefas", parent: "carteira_cs" },
      { key: "cs_usage_import", label: "Carteira de CS — Importações e atualização", parent: "carteira_cs", minRole: "admin" },
      { key: "analise_churn", label: "Análise do Churn", route: "/atendimentos/analise-churn" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    areas: [
      { key: "campaign_history", label: "Histórico de Campanhas", route: "/sales-campaigns/history", minRole: "tatico" },
      { key: "campaign_planning", label: "Planejamento de Campanhas", route: "/sales-campaigns/planejamento", minRole: "tatico" },
      { key: "sales_campaigns", label: "Campanhas de Sales", route: "/sales-campaigns", minRole: "tatico" },
      { key: "comissionamento", label: "Comissionamento", route: "/comissionamento" },
      { key: "link_builder", label: "Gerador de Ofertas", route: "/link-builder" },
      { key: "precificacao", label: "Precificação Serviços", route: "/precificacao" },
      { key: "planejamento_comercial", label: "Planejamento Comercial", route: "/planejamento-comercial" },
      { key: "base_expansion", label: "Planejamento — Potencial da Base", parent: "planejamento_comercial" },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    areas: [
      { key: "team", label: "Equipe", route: "/team" },
      { key: "users", label: "Usuários & Acessos", route: "/users", minRole: "admin" },
    ],
  },
  {
    key: "integracoes",
    label: "Integrações",
    areas: [
      { key: "integration_stripe", label: "Stripe", route: "/integrations/stripe", minRole: "admin" },
      { key: "integration_chatwoot", label: "Chatwoot", route: "/integrations/chatwoot", minRole: "admin" },
      { key: "integration_ac_funnels", label: "Histórico ActiveCampaign (somente leitura)", route: "/integrations/ac-funnels", minRole: "tatico", readOnly: true },
    ],
  },
] as const satisfies readonly { key: string; label: string; areas: readonly AreaDef[] }[];

export type SectionKey = typeof CRM_SECTIONS[number]["key"];
export type AreaKey = typeof CRM_SECTIONS[number]["areas"][number]["key"];
export type CrmAreaKey = SectionKey | AreaKey;
export type AreaPermission = { view: boolean; create: boolean; edit: boolean };
export type Permissions = Partial<Record<CrmAreaKey, AreaPermission>>;

export const AREA_DEFS: Record<string, AreaDef & { section: SectionKey }> = Object.fromEntries(
  CRM_SECTIONS.flatMap((s) => (s.areas as readonly AreaDef[]).map((a) => [a.key, { ...a, section: s.key }])),
);

export function isKnownArea(key: string): boolean {
  return key in AREA_DEFS || CRM_SECTIONS.some((s) => s.key === key);
}

export function roleMeets(role: AppRoleKey | null | undefined, min?: AppRoleKey): boolean {
  if (!min) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Preenche sub-áreas ausentes herdando da área mãe (ordem de cadastro garante mãe antes). */
export function inheritParents(perms: Permissions): Permissions {
  const out: Permissions = { ...perms };
  for (const def of Object.values(AREA_DEFS)) {
    if (def.parent && !out[def.key as CrmAreaKey] && out[def.parent as CrmAreaKey]) {
      out[def.key as CrmAreaKey] = { ...out[def.parent as CrmAreaKey]! };
    }
  }
  return out;
}

export function can(
  area: CrmAreaKey,
  action: keyof AreaPermission,
  ctx: { role: AppRoleKey | null | undefined; permissions: Permissions },
): boolean {
  if (ctx.role === "admin") return true;
  const def = AREA_DEFS[area];
  if (def && !roleMeets(ctx.role, def.minRole)) return false;
  if (def?.readOnly && action !== "view") return false;
  return !!ctx.permissions[area]?.[action];
}
