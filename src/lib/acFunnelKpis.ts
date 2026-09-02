/**
 * Cálculos puros de KPIs de conversão dos Funis ActiveCampaign.
 * Todas as datas são interpretadas no fuso America/Sao_Paulo.
 */

const TZ = "America/Sao_Paulo";

export type KpiEvent = {
  ac_deal_id: string;
  event_type: string;
  from_stage_id: string;
  to_stage_id: string;
  deal_value: number;
  owner_name: string | null;
  occurred_at: string;
};

export type KpiStage = { ac_stage_id: string; title: string; position: number };

export type KpiDeal = {
  ac_deal_id: string;
  owner_name: string | null;
  status: number;
  value: number;
  deal_created_at: string | null;
  closed_at: string | null;
  stage_changed_at: string | null;
};

export function spDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
}

/** Intervalo imediatamente anterior, com o mesmo número de dias. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to) + 1;
  const prevTo = shiftDay(from, -1);
  return { from: shiftDay(prevTo, -(len - 1)), to: prevTo };
}

export type ConversionKpis = {
  created: number;
  won: number;
  lost: number;
  wonValue: number;
  /** Ganhos / (Ganhos + Perdidos) fechados no período, em %. */
  winRate: number | null;
  /** Dos negócios criados no período, quantos já foram ganhos, em %. */
  entryConversion: number | null;
  /** Valor médio dos negócios ganhos. */
  avgTicket: number | null;
  /** Dias médios entre criação e fechamento dos ganhos. */
  cycleDays: number | null;
  /** Movimentações progressivas / total de movimentações, em %. */
  advanceRate: number | null;
  moves: number;
};

export function computeConversionKpis(
  events: KpiEvent[],
  deals: KpiDeal[],
  stages: KpiStage[],
): ConversionKpis {
  const pos = new Map(stages.map((s) => [s.ac_stage_id, s.position]));
  const created = events.filter((e) => e.event_type === "created");
  const moves = events.filter((e) => e.event_type === "stage_change");
  const won = events.filter((e) => e.event_type === "won");
  const lost = events.filter((e) => e.event_type === "lost");

  const wonValue = won.reduce((a, e) => a + Number(e.deal_value || 0), 0);
  const closed = won.length + lost.length;

  const dealById = new Map(deals.map((d) => [d.ac_deal_id, d]));
  const createdIds = new Set(created.map((e) => e.ac_deal_id));
  const wonIds = new Set(won.map((e) => e.ac_deal_id));
  const createdWon = Array.from(createdIds).filter((id) => wonIds.has(id)).length;

  const cycles: number[] = [];
  for (const e of won) {
    const d = dealById.get(e.ac_deal_id);
    if (!d?.deal_created_at) continue;
    const days = (new Date(e.occurred_at).getTime() - new Date(d.deal_created_at).getTime()) / 86400000;
    if (days >= 0) cycles.push(days);
  }

  const directional = moves.filter((m) => pos.has(m.from_stage_id) && pos.has(m.to_stage_id));
  const forward = directional.filter((m) => (pos.get(m.to_stage_id) ?? 0) > (pos.get(m.from_stage_id) ?? 0));

  return {
    created: created.length,
    won: won.length,
    lost: lost.length,
    wonValue,
    moves: moves.length,
    winRate: closed ? (won.length / closed) * 100 : null,
    entryConversion: createdIds.size ? (createdWon / createdIds.size) * 100 : null,
    avgTicket: won.length ? wonValue / won.length : null,
    cycleDays: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    advanceRate: directional.length ? (forward.length / directional.length) * 100 : null,
  };
}

export type StageFlowRow = {
  stageId: string;
  title: string;
  entries: number;
  advanced: number;
  regressed: number;
  won: number;
  lost: number;
  /** avançou / entradas */
  passRate: number | null;
  /** ganhou / entradas */
  winRate: number | null;
  /** perdidos / entradas */
  lossRate: number | null;
  /** dias médios de permanência na etapa (saídas observadas no período) */
  avgDays: number | null;
};

/** Conversão etapa a etapa a partir dos eventos do período. */
export function computeStageFlow(events: KpiEvent[], stages: KpiStage[]): StageFlowRow[] {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const pos = new Map(ordered.map((s) => [s.ac_stage_id, s.position]));

  const base = new Map<string, StageFlowRow>();
  for (const s of ordered) {
    base.set(s.ac_stage_id, {
      stageId: s.ac_stage_id,
      title: s.title,
      entries: 0,
      advanced: 0,
      regressed: 0,
      won: 0,
      lost: 0,
      passRate: null,
      lossRate: null,
      cumulative: null,
      avgDays: null,
    });
  }

  const dwell = new Map<string, number[]>();
  const byDeal = new Map<string, KpiEvent[]>();
  for (const e of events) {
    const arr = byDeal.get(e.ac_deal_id) ?? [];
    arr.push(e);
    byDeal.set(e.ac_deal_id, arr);
  }

  for (const [, list] of byDeal) {
    list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    let enteredStage: string | null = null;
    let enteredAt: string | null = null;
    for (const e of list) {
      if (e.event_type === "created" || e.event_type === "stage_change") {
        const to = base.get(e.to_stage_id);
        if (to) to.entries++;
      }
      if (e.event_type === "stage_change") {
        const row = base.get(e.from_stage_id);
        if (row && pos.has(e.to_stage_id)) {
          if ((pos.get(e.to_stage_id) ?? 0) > (pos.get(e.from_stage_id) ?? 0)) row.advanced++;
          else row.regressed++;
        }
      }
      if (e.event_type === "won" || e.event_type === "lost") {
        const row = base.get(e.from_stage_id);
        if (row) row[e.event_type === "won" ? "won" : "lost"]++;
      }

      // Permanência: tempo entre entrar numa etapa e sair dela
      const leaves = e.event_type === "stage_change" || e.event_type === "won" || e.event_type === "lost";
      if (leaves && enteredStage && enteredStage === e.from_stage_id && enteredAt) {
        const days = (new Date(e.occurred_at).getTime() - new Date(enteredAt).getTime()) / 86400000;
        if (days >= 0) {
          const arr = dwell.get(enteredStage) ?? [];
          arr.push(days);
          dwell.set(enteredStage, arr);
        }
      }
      if (e.event_type === "created" || e.event_type === "stage_change") {
        enteredStage = e.to_stage_id;
        enteredAt = e.occurred_at;
      }
    }
  }

  const rows = ordered.flatMap((s) => {
    const row = base.get(s.ac_stage_id);
    return row ? [row] : [];
  });
  const firstEntries = rows[0]?.entries ?? 0;
  for (const r of rows) {
    r.passRate = r.entries ? ((r.advanced + r.won) / r.entries) * 100 : null;
    r.lossRate = r.entries ? (r.lost / r.entries) * 100 : null;
    r.cumulative = firstEntries ? (r.entries / firstEntries) * 100 : null;
    const d = dwell.get(r.stageId);
    r.avgDays = d?.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
  }
  return rows;
}

export type OwnerConversion = {
  owner: string;
  won: number;
  lost: number;
  value: number;
  winRate: number | null;
  avgTicket: number | null;
};

/** Win rate e ticket médio por proprietário, com base nos eventos de fechamento. */
export function computeOwnerConversion(events: KpiEvent[]): OwnerConversion[] {
  const map = new Map<string, OwnerConversion>();
  for (const e of events) {
    if (e.event_type !== "won" && e.event_type !== "lost") continue;
    const key = e.owner_name ?? "Sem proprietário";
    const row =
      map.get(key) ?? { owner: key, won: 0, lost: 0, value: 0, winRate: null, avgTicket: null };
    if (e.event_type === "won") {
      row.won++;
      row.value += Number(e.deal_value || 0);
    } else row.lost++;
    map.set(key, row);
  }
  const rows = Array.from(map.values());
  for (const r of rows) {
    const closed = r.won + r.lost;
    r.winRate = closed ? (r.won / closed) * 100 : null;
    r.avgTicket = r.won ? r.value / r.won : null;
  }
  return rows.sort((a, b) => b.won - a.won || (b.winRate ?? 0) - (a.winRate ?? 0));
}

/** Variação em pontos percentuais (para taxas) — null quando não há base. */
export function deltaPp(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

/** Variação percentual (para valores absolutos) — null quando não há base. */
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/* ------------------------------------------------------------------ *
 * Conversão de etapa para etapa/ganho, por executivo
 * ------------------------------------------------------------------ */

export type StagePairRow = {
  owner: string;
  base: number;
  converted: number;
  rate: number | null;
  value: number;
  avgTicket: number | null;
};

const ownerKey = (name: string | null | undefined) => (name ?? "").trim() || "Sem proprietário";

/**
 * Dos negócios que entraram em `fromStageId` no período, quantos chegaram ao destino.
 * `destination` = "won" (ganho) ou o id de uma etapa (chegar nela ou em qualquer posterior).
 */
export function computeStagePairByOwner(
  events: KpiEvent[],
  stages: KpiStage[],
  fromStageId: string,
  destination: string,
): { rows: StagePairRow[]; total: StagePairRow } {
  const pos = new Map(stages.map((s) => [s.ac_stage_id, s.position]));
  const destPos = destination === "won" ? null : pos.get(destination) ?? null;

  const ordered = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  // Owner do negócio: primeiro owner observado nos eventos do período
  const ownerOf = new Map<string, string>();
  for (const e of ordered) if (!ownerOf.has(e.ac_deal_id)) ownerOf.set(e.ac_deal_id, ownerKey(e.owner_name));

  const baseDeals = new Set<string>();
  for (const e of ordered) {
    if ((e.event_type === "created" || e.event_type === "stage_change") && e.to_stage_id === fromStageId) {
      baseDeals.add(e.ac_deal_id);
    }
  }

  const convertedValue = new Map<string, number>();
  for (const e of ordered) {
    if (!baseDeals.has(e.ac_deal_id)) continue;
    if (destination === "won") {
      if (e.event_type === "won") convertedValue.set(e.ac_deal_id, Number(e.deal_value || 0));
      continue;
    }
    if (e.event_type !== "stage_change") continue;
    const p = pos.get(e.to_stage_id);
    if (destPos !== null && p !== undefined && p >= destPos) {
      convertedValue.set(e.ac_deal_id, Number(e.deal_value || 0));
    }
  }

  const map = new Map<string, StagePairRow>();
  const bump = (owner: string) => {
    const row = map.get(owner) ?? { owner, base: 0, converted: 0, rate: null, value: 0, avgTicket: null };
    map.set(owner, row);
    return row;
  };

  for (const dealId of baseDeals) {
    const row = bump(ownerOf.get(dealId) ?? "Sem proprietário");
    row.base++;
    if (convertedValue.has(dealId)) {
      row.converted++;
      row.value += convertedValue.get(dealId) ?? 0;
    }
  }

  const rows = Array.from(map.values());
  for (const r of rows) {
    r.rate = r.base ? (r.converted / r.base) * 100 : null;
    r.avgTicket = r.converted ? r.value / r.converted : null;
  }
  rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.base - a.base);

  const base = rows.reduce((a, r) => a + r.base, 0);
  const converted = rows.reduce((a, r) => a + r.converted, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const total: StagePairRow = {
    owner: "Média geral",
    base,
    converted,
    value,
    rate: base ? (converted / base) * 100 : null,
    avgTicket: converted ? value / converted : null,
  };
  return { rows, total };
}

/* ------------------------------------------------------------------ *
 * Coortes: criado no período x criado antes
 * ------------------------------------------------------------------ */

export type CohortOwnerRow = {
  owner: string;
  created: number;
  wonSamePeriod: number;
  wonEarlierCohort: number;
  wonTotal: number;
  value: number;
  intraRate: number | null;
  cycleDays: number | null;
};

/**
 * Por executivo: criados no período, ganhos no período que nasceram no período
 * (coorte intra-período) e ganhos no período de safras anteriores.
 */
export function computeCohortByOwner(
  events: KpiEvent[],
  deals: KpiDeal[],
  from: string,
  to: string,
): { rows: CohortOwnerRow[]; total: CohortOwnerRow } {
  const dealById = new Map(deals.map((d) => [d.ac_deal_id, d]));
  const createdEventDay = new Map<string, string>();
  for (const e of events) if (e.event_type === "created") createdEventDay.set(e.ac_deal_id, spDay(e.occurred_at));

  const map = new Map<string, CohortOwnerRow>();
  const cycles = new Map<string, number[]>();
  const bump = (owner: string) => {
    const row =
      map.get(owner) ??
      {
        owner,
        created: 0,
        wonSamePeriod: 0,
        wonEarlierCohort: 0,
        wonTotal: 0,
        value: 0,
        intraRate: null,
        cycleDays: null,
      };
    map.set(owner, row);
    return row;
  };

  for (const e of events) {
    const owner = ownerKey(e.owner_name);
    if (e.event_type === "created") {
      bump(owner).created++;
      continue;
    }
    if (e.event_type !== "won") continue;
    const row = bump(owner);
    row.wonTotal++;
    row.value += Number(e.deal_value || 0);

    const createdAt = dealById.get(e.ac_deal_id)?.deal_created_at ?? null;
    const createdDay = createdAt ? spDay(createdAt) : createdEventDay.get(e.ac_deal_id) ?? "";
    if (createdDay && createdDay >= from && createdDay <= to) row.wonSamePeriod++;
    else row.wonEarlierCohort++;

    if (createdAt) {
      const days = (new Date(e.occurred_at).getTime() - new Date(createdAt).getTime()) / 86400000;
      if (days >= 0) {
        const arr = cycles.get(owner) ?? [];
        arr.push(days);
        cycles.set(owner, arr);
      }
    }
  }

  const rows = Array.from(map.values());
  for (const r of rows) {
    r.intraRate = r.created ? (r.wonSamePeriod / r.created) * 100 : null;
    const c = cycles.get(r.owner);
    r.cycleDays = c?.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
  }
  rows.sort((a, b) => b.wonTotal - a.wonTotal || b.created - a.created || a.owner.localeCompare(b.owner, "pt-BR"));

  const created = rows.reduce((a, r) => a + r.created, 0);
  const wonSamePeriod = rows.reduce((a, r) => a + r.wonSamePeriod, 0);
  const wonEarlierCohort = rows.reduce((a, r) => a + r.wonEarlierCohort, 0);
  const wonTotal = rows.reduce((a, r) => a + r.wonTotal, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const allCycles = Array.from(cycles.values()).flat();
  const total: CohortOwnerRow = {
    owner: "Média geral",
    created,
    wonSamePeriod,
    wonEarlierCohort,
    wonTotal,
    value,
    intraRate: created ? (wonSamePeriod / created) * 100 : null,
    cycleDays: allCycles.length ? allCycles.reduce((a, b) => a + b, 0) / allCycles.length : null,
  };
  return { rows, total };
}

/* ------------------------------------------------------------------ *
 * Reuniões por executivo
 * ------------------------------------------------------------------ */

export type KpiTask = {
  ac_task_id: string;
  ac_deal_id: string;
  task_type: string | null;
  title: string | null;
  owner_name: string | null;
  due_date: string | null;
  is_done: boolean;
  done_at: string | null;
};

export type MeetingOwnerRow = {
  owner: string;
  scheduled: number;
  done: number;
  pending: number;
  overdue: number;
  doneRate: number | null;
  won: number;
  wonRate: number | null;
};

/**
 * Reuniões agendadas no período (por data prevista) e sua realização, por executivo.
 * `wonDealIds` permite ligar reunião → ganho no mesmo período.
 */
export function computeMeetingsByOwner(
  tasks: KpiTask[],
  opts: { from: string; to: string; today: string; types: string[]; wonDealIds?: Set<string> },
): { rows: MeetingOwnerRow[]; total: MeetingOwnerRow } {
  const wanted = new Set(opts.types.map((t) => t.trim().toLowerCase()));
  const inPeriod = (iso: string | null) => {
    const day = spDay(iso);
    return !!day && day >= opts.from && day <= opts.to;
  };

  const map = new Map<string, MeetingOwnerRow>();
  const wonDeals = new Map<string, Set<string>>();
  const bump = (owner: string) => {
    const row =
      map.get(owner) ??
      { owner, scheduled: 0, done: 0, pending: 0, overdue: 0, doneRate: null, won: 0, wonRate: null };
    map.set(owner, row);
    return row;
  };

  for (const t of tasks) {
    const type = (t.task_type ?? t.title ?? "").trim().toLowerCase();
    if (!wanted.has(type)) continue;
    if (!inPeriod(t.due_date) && !(t.is_done && inPeriod(t.done_at))) continue;

    const owner = ownerKey(t.owner_name);
    const row = bump(owner);
    row.scheduled++;
    if (t.is_done) row.done++;
    else {
      row.pending++;
      const due = spDay(t.due_date);
      if (due && due < opts.today) row.overdue++;
    }
    if (opts.wonDealIds?.has(t.ac_deal_id)) {
      const set = wonDeals.get(owner) ?? new Set<string>();
      set.add(t.ac_deal_id);
      wonDeals.set(owner, set);
    }
  }

  const rows = Array.from(map.values());
  for (const r of rows) {
    r.won = wonDeals.get(r.owner)?.size ?? 0;
    r.doneRate = r.scheduled ? (r.done / r.scheduled) * 100 : null;
    r.wonRate = r.scheduled ? (r.won / r.scheduled) * 100 : null;
  }
  rows.sort((a, b) => b.scheduled - a.scheduled || a.owner.localeCompare(b.owner, "pt-BR"));

  const scheduled = rows.reduce((a, r) => a + r.scheduled, 0);
  const done = rows.reduce((a, r) => a + r.done, 0);
  const won = rows.reduce((a, r) => a + r.won, 0);
  const total: MeetingOwnerRow = {
    owner: "Média geral",
    scheduled,
    done,
    pending: rows.reduce((a, r) => a + r.pending, 0),
    overdue: rows.reduce((a, r) => a + r.overdue, 0),
    won,
    doneRate: scheduled ? (done / scheduled) * 100 : null,
    wonRate: scheduled ? (won / scheduled) * 100 : null,
  };
  return { rows, total };
}
