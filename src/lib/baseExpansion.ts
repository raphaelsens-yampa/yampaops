// Projeção de expansão da base (Upsell de software e Cross-sell de BPO/Consultoria).
// Funções puras: todos os números saem daqui, a tela só exibe.

export type BaseClient = {
  email: string;
  company_name: string | null;
  plano: string | null;
  mrr: number;
  tenure_days: number | null;
  origem_cliente: string | null;
  /** Tier de uso do produto (planilha de uso). Ausente = sem dado. */
  usage_tier?: string | null;
  usage_ie?: number | null;
};

export type CatalogService = { nome: string; preco_mensal: number; custo: number; meses: number };

export type Scenario = "pessimista" | "realista" | "otimista";
export const SCENARIOS: Scenario[] = ["pessimista", "realista", "otimista"];

export type ExpansionTrack = {
  key: string;
  label: string;
  kind: "upsell" | "cross_sell";
  eligiblePlans: string[];
  minTenureDays: number;
  /** Upsell: plano de destino (ticket = média destino − MRR atual do cliente). */
  targetPlan?: string;
  /** Cross-sell: serviço do catálogo. */
  serviceName?: string;
  adoptionPct: Record<Scenario, number>;
  /** Tiers de uso aceitos; vazio/ausente = todos (inclusive sem dado). */
  usageTiers?: string[];
};

export type OriginFilter = "todas" | "yampa" | "4blue";

export const roundUsers = (n: number) => Math.floor(n + 0.5);

export const normPlan = (p: string | null | undefined) => (p || "SEM PLANO").trim().toUpperCase();

/** Contas internas com MRR virtual (não são clientes reais). */
export const EXCLUDED_EMAILS = ["lau.marcelly@gmail.com"];

export function excludeInternal(base: BaseClient[]) {
  const ex = new Set(EXCLUDED_EMAILS);
  return base.filter((c) => !ex.has((c.email || "").trim().toLowerCase()));
}

export function newUpsellTrack(n: number): ExpansionTrack {
  return {
    key: `upsell_${Date.now()}_${n}`, label: `Upsell ${n}`, kind: "upsell", eligiblePlans: [],
    minTenureDays: 60, targetPlan: undefined, adoptionPct: { pessimista: 3, realista: 6, otimista: 10 },
  };
}

export function filterByOrigin(base: BaseClient[], origin: OriginFilter) {
  if (origin === "todas") return base;
  return base.filter((c) => (c.origem_cliente || "yampa").toLowerCase() === origin);
}

export function planSummary(base: BaseClient[]) {
  const map = new Map<string, { plano: string; clientes: number; mrr: number }>();
  for (const c of base) {
    const k = normPlan(c.plano);
    const r = map.get(k) || { plano: k, clientes: 0, mrr: 0 };
    r.clientes += 1;
    r.mrr += Number(c.mrr) || 0;
    map.set(k, r);
  }
  return [...map.values()]
    .map((r) => ({ ...r, ticket: r.clientes ? r.mrr / r.clientes : 0 }))
    .sort((a, b) => b.clientes - a.clientes);
}

export function eligibleClients(base: BaseClient[], t: ExpansionTrack) {
  const plans = new Set(t.eligiblePlans.map(normPlan));
  const tiers = t.usageTiers?.length ? new Set(t.usageTiers) : null;
  return base.filter((c) => plans.has(normPlan(c.plano)) && (c.tenure_days ?? 0) >= t.minTenureDays
    && (!tiers || (!!c.usage_tier && tiers.has(c.usage_tier))));
}

/** MRR adicional médio por contrato fechado nesta frente. */
export function trackTicket(base: BaseClient[], t: ExpansionTrack, catalog: CatalogService[]) {
  if (t.kind === "cross_sell") {
    return catalog.find((s) => s.nome === t.serviceName)?.preco_mensal ?? 0;
  }
  const target = planSummary(base).find((p) => p.plano === normPlan(t.targetPlan));
  const elig = eligibleClients(base, t);
  if (!target || !elig.length) return 0;
  const current = elig.reduce((s, c) => s + (Number(c.mrr) || 0), 0) / elig.length;
  return Math.max(0, target.ticket - current);
}

/** Custo mensal de entrega do serviço (custo do contrato / meses). Upsell de software: sem custo cadastrado. */
export function trackMonthlyCost(t: ExpansionTrack, catalog: CatalogService[]) {
  if (t.kind !== "cross_sell") return 0;
  const s = catalog.find((x) => x.nome === t.serviceName);
  return s && s.meses > 0 ? s.custo / s.meses : 0;
}

export type TrackProjection = {
  key: string;
  label: string;
  elegiveis: number;
  ticket: number;
  byScenario: Record<Scenario, { contratos: number; mrr: number; arr: number; margemMensal: number }>;
};

export function projectTrack(base: BaseClient[], t: ExpansionTrack, catalog: CatalogService[]): TrackProjection {
  const elegiveis = eligibleClients(base, t).length;
  const ticket = trackTicket(base, t, catalog);
  const cost = trackMonthlyCost(t, catalog);
  const byScenario = {} as TrackProjection["byScenario"];
  for (const s of SCENARIOS) {
    const contratos = roundUsers((elegiveis * (t.adoptionPct[s] || 0)) / 100);
    const mrr = contratos * ticket;
    byScenario[s] = { contratos, mrr, arr: mrr * 12, margemMensal: contratos * (ticket - cost) };
  }
  return { key: t.key, label: t.label, elegiveis, ticket, byScenario };
}

/** Distribui contratos em N meses (inteiros, soma exata) e acumula o MRR adicionado. */
export function rampPlan(contratos: number, ticket: number, months: number) {
  const n = Math.max(1, Math.floor(months));
  const out: { mes: number; contratos: number; mrrAcumulado: number }[] = [];
  let done = 0;
  for (let i = 1; i <= n; i++) {
    const target = roundUsers((contratos * i) / n);
    const c = target - done;
    done = target;
    out.push({ mes: i, contratos: c, mrrAcumulado: done * ticket });
  }
  return out;
}

export const DEFAULT_TRACKS: ExpansionTrack[] = [
  {
    key: "upsell_control",
    label: "Upsell",
    kind: "upsell",
    eligiblePlans: ["CONTROL"],
    minTenureDays: 60,
    targetPlan: "PROFIT",
    adoptionPct: { pessimista: 3, realista: 6, otimista: 10 },
  },
  {
    key: "bpo",
    label: "Cross-sell BPO Financeiro",
    kind: "cross_sell",
    eligiblePlans: ["PROFIT", "RESULT", "CLARITY", "SUCCESS"],
    minTenureDays: 60,
    serviceName: "BPO Pleno V2",
    adoptionPct: { pessimista: 1, realista: 2, otimista: 4 },
  },
  {
    key: "consultoria",
    label: "Cross-sell Consultoria / Time Financeiro",
    kind: "cross_sell",
    eligiblePlans: ["RESULT", "SUCCESS", "CLARITY"],
    minTenureDays: 90,
    serviceName: "Time Financeiro com BPO Pleno em 12x V2",
    adoptionPct: { pessimista: 1, realista: 3, otimista: 5 },
  },
];
