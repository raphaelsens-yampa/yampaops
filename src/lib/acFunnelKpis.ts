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
  /** (avançou + ganhou) / entradas */
  passRate: number | null;
  /** perdidos / entradas */
  lossRate: number | null;
  /** entradas na etapa / entradas na primeira etapa */
  cumulative: number | null;
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
