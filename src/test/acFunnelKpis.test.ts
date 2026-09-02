import { describe, expect, it } from "vitest";
import {
  computeCohortByOwner,
  computeConversionKpis,
  computeMeetingsByOwner,
  computeOwnerConversion,
  computeStageFlow,
  computeStagePairByOwner,
  deltaPct,
  deltaPp,
  previousRange,
  type KpiDeal,
  type KpiEvent,
  type KpiStage,
} from "@/lib/acFunnelKpis";

const stages: KpiStage[] = [
  { ac_stage_id: "1", title: "Novo", position: 1 },
  { ac_stage_id: "2", title: "Reunião", position: 2 },
  { ac_stage_id: "3", title: "Proposta", position: 3 },
];

function ev(p: Partial<KpiEvent>): KpiEvent {
  return {
    ac_deal_id: "d1",
    event_type: "stage_change",
    from_stage_id: "1",
    to_stage_id: "2",
    deal_value: 0,
    owner_name: "Ana",
    occurred_at: "2026-09-01T12:00:00Z",
    ...p,
  };
}

describe("previousRange", () => {
  it("usa o intervalo anterior de mesmo tamanho", () => {
    expect(previousRange("2026-09-01", "2026-09-15")).toEqual({ from: "2026-08-17", to: "2026-08-31" });
  });
  it("funciona para um único dia", () => {
    expect(previousRange("2026-09-10", "2026-09-10")).toEqual({ from: "2026-09-09", to: "2026-09-09" });
  });
});

describe("computeConversionKpis", () => {
  const events: KpiEvent[] = [
    ev({ ac_deal_id: "a", event_type: "created", from_stage_id: "", to_stage_id: "1", occurred_at: "2026-09-01T12:00:00Z" }),
    ev({ ac_deal_id: "b", event_type: "created", from_stage_id: "", to_stage_id: "1", occurred_at: "2026-09-01T12:00:00Z" }),
    ev({ ac_deal_id: "a", from_stage_id: "1", to_stage_id: "2", occurred_at: "2026-09-02T12:00:00Z" }),
    ev({ ac_deal_id: "b", from_stage_id: "2", to_stage_id: "1", occurred_at: "2026-09-02T12:00:00Z" }),
    ev({ ac_deal_id: "a", event_type: "won", from_stage_id: "2", to_stage_id: "2", deal_value: 1000, occurred_at: "2026-09-03T12:00:00Z" }),
    ev({ ac_deal_id: "b", event_type: "lost", from_stage_id: "1", to_stage_id: "1", occurred_at: "2026-09-04T12:00:00Z" }),
  ];
  const deals: KpiDeal[] = [
    { ac_deal_id: "a", owner_name: "Ana", status: 1, value: 1000, deal_created_at: "2026-09-01T12:00:00Z", closed_at: "2026-09-03T12:00:00Z", stage_changed_at: null },
    { ac_deal_id: "b", owner_name: "Ana", status: 2, value: 0, deal_created_at: "2026-09-01T12:00:00Z", closed_at: "2026-09-04T12:00:00Z", stage_changed_at: null },
  ];

  it("calcula win rate, coorte, ticket, ciclo e avanço", () => {
    const k = computeConversionKpis(events, deals, stages);
    expect(k.winRate).toBe(50);
    expect(k.entryConversion).toBe(50);
    expect(k.avgTicket).toBe(1000);
    expect(k.cycleDays).toBe(2);
    expect(k.advanceRate).toBe(50);
  });

  it("retorna null quando não há base", () => {
    const k = computeConversionKpis([], [], stages);
    expect(k.winRate).toBeNull();
    expect(k.entryConversion).toBeNull();
    expect(k.cycleDays).toBeNull();
  });
});

describe("computeStageFlow", () => {
  it("mede entradas, passagem, vazamento e acumulado", () => {
    const events: KpiEvent[] = [
      ev({ ac_deal_id: "a", event_type: "created", from_stage_id: "", to_stage_id: "1", occurred_at: "2026-09-01T12:00:00Z" }),
      ev({ ac_deal_id: "b", event_type: "created", from_stage_id: "", to_stage_id: "1", occurred_at: "2026-09-01T12:00:00Z" }),
      ev({ ac_deal_id: "a", from_stage_id: "1", to_stage_id: "2", occurred_at: "2026-09-03T12:00:00Z" }),
      ev({ ac_deal_id: "b", event_type: "lost", from_stage_id: "1", to_stage_id: "1", occurred_at: "2026-09-02T12:00:00Z" }),
    ];
    const rows = computeStageFlow(events, stages);
    const novo = rows[0];
    expect(novo.entries).toBe(2);
    expect(novo.advanced).toBe(1);
    expect(novo.lost).toBe(1);
    expect(novo.passRate).toBe(50);
    expect(novo.lossRate).toBe(50);
    expect(novo.winRate).toBe(0);
    expect(novo.avgDays).toBeCloseTo(1.5, 5);
    expect(rows[1].entries).toBe(1);
    expect(rows[1].winRate).toBe(0);
  });
});

describe("computeOwnerConversion", () => {
  it("agrupa fechamentos por proprietário", () => {
    const rows = computeOwnerConversion([
      ev({ event_type: "won", owner_name: "Ana", deal_value: 500 }),
      ev({ event_type: "lost", owner_name: "Ana" }),
      ev({ event_type: "won", owner_name: "Bia", deal_value: 300 }),
    ]);
    expect(rows.find((r) => r.owner === "Ana")?.winRate).toBe(50);
    expect(rows.find((r) => r.owner === "Bia")?.winRate).toBe(100);
    expect(rows.find((r) => r.owner === "Bia")?.avgTicket).toBe(300);
  });
});

describe("new funnel conversion cuts", () => {
  const events: KpiEvent[] = [
    ev({ ac_deal_id: "a", event_type: "created", from_stage_id: "", to_stage_id: "1", owner_name: "Ana", occurred_at: "2026-09-01T12:00:00Z" }),
    ev({ ac_deal_id: "a", from_stage_id: "1", to_stage_id: "2", owner_name: "Ana", occurred_at: "2026-09-02T12:00:00Z" }),
    ev({ ac_deal_id: "a", from_stage_id: "2", to_stage_id: "3", owner_name: "Ana", occurred_at: "2026-09-03T12:00:00Z" }),
    ev({ ac_deal_id: "a", event_type: "won", from_stage_id: "3", to_stage_id: "3", owner_name: "Ana", deal_value: 1000, occurred_at: "2026-09-04T12:00:00Z" }),
    ev({ ac_deal_id: "b", event_type: "created", from_stage_id: "", to_stage_id: "1", owner_name: "Bia", occurred_at: "2026-09-01T12:00:00Z" }),
    ev({ ac_deal_id: "b", from_stage_id: "1", to_stage_id: "2", owner_name: "Bia", occurred_at: "2026-09-02T12:00:00Z" }),
  ];
  it("calcula conversão de uma etapa ao ganho por executivo e geral", () => {
    const result = computeStagePairByOwner(events, stages, "2", "won");
    expect(result.total).toMatchObject({ base: 2, converted: 1, rate: 50 });
    expect(result.rows.find((r) => r.owner === "Ana")?.rate).toBe(100);
    expect(result.rows.find((r) => r.owner === "Bia")?.rate).toBe(0);
  });
  it("separa coorte intra-período de safra anterior", () => {
    const deals: KpiDeal[] = [
      { ac_deal_id: "a", owner_name: "Ana", status: 1, value: 1000, deal_created_at: "2026-09-01T12:00:00Z", closed_at: "2026-09-04T12:00:00Z", stage_changed_at: null },
      { ac_deal_id: "b", owner_name: "Bia", status: 1, value: 500, deal_created_at: "2026-08-01T12:00:00Z", closed_at: "2026-09-04T12:00:00Z", stage_changed_at: null },
    ];
    const result = computeCohortByOwner(events.concat(ev({ ac_deal_id: "b", event_type: "won", from_stage_id: "2", to_stage_id: "2", owner_name: "Bia", deal_value: 500, occurred_at: "2026-09-04T12:00:00Z" })), deals, "2026-09-01", "2026-09-30");
    expect(result.total).toMatchObject({ created: 2, wonSamePeriod: 1, wonEarlierCohort: 1, intraRate: 50 });
  });
  it("calcula reuniões realizadas, pendentes e taxa por executivo", () => {
    const result = computeMeetingsByOwner([
      { ac_task_id: "t1", ac_deal_id: "a", task_type: "Reunião", title: "Reunião", owner_name: "Ana", due_date: "2026-09-05T12:00:00Z", is_done: true, done_at: "2026-09-05T13:00:00Z" },
      { ac_task_id: "t2", ac_deal_id: "b", task_type: "Reunião", title: "Reunião", owner_name: "Ana", due_date: "2026-09-06T12:00:00Z", is_done: false, done_at: null },
    ], { from: "2026-09-01", to: "2026-09-30", today: "2026-09-10", types: ["Reunião"], wonDealIds: new Set(["a"]) });
    expect(result.total).toMatchObject({ scheduled: 2, done: 1, pending: 1, overdue: 1, doneRate: 50, won: 1 });
  });
});

describe("deltas", () => {
  it("pp e % com guarda de base zero", () => {
    expect(deltaPp(50, 40)).toBe(10);
    expect(deltaPp(50, null)).toBeNull();
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(120, 0)).toBeNull();
  });
});
