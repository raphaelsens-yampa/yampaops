import { describe, expect, it } from "vitest";
import {
  computeConversionKpis,
  computeOwnerConversion,
  computeStageFlow,
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
    expect(previousRange("2026-09-01", "2026-09-15")).toEqual({ from: "2026-08-18", to: "2026-08-31" });
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
    expect(novo.avgDays).toBeCloseTo(1.5, 5);
    expect(rows[1].entries).toBe(1);
    expect(rows[1].cumulative).toBe(50);
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

describe("deltas", () => {
  it("pp e % com guarda de base zero", () => {
    expect(deltaPp(50, 40)).toBe(10);
    expect(deltaPp(50, null)).toBeNull();
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(120, 0)).toBeNull();
  });
});
