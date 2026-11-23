import { describe, it, expect } from "vitest";
import { dailySeries, cumulative, filterPacingEvents, projectMonth, roundHalfUp, trendLine, lastBusinessDaysPace, type PacingEvent } from "@/lib/newMrrPacing";

const ev: PacingEvent[] = [
  { date: "2026-11-02", kind: "novos", mrr: 200 },
  { date: "2026-11-03", kind: "upsell", mrr: 100 },
  { date: "2026-11-03", kind: "recuperados", mrr: 50 },
  { date: "2026-10-30", kind: "novos", mrr: 999 },
];

describe("newMrrPacing", () => {
  it("monta série diária só do mês e por composição", () => {
    const s = dailySeries(ev, "2026-11", "mrr", "total");
    expect(s.length).toBe(30);
    expect(s[1]).toBe(200);
    expect(s[2]).toBe(150);
    expect(cumulative(s)[29]).toBe(350);
    expect(dailySeries(ev, "2026-11", "qty", "upsell")[2]).toBe(1);
  });

  it("projeta por dias úteis restantes", () => {
    // Nov/26: dias 2..6 úteis (seg-sex). Até dia 6: 5 dias úteis, realizado 350 → 70/dia.
    const s = dailySeries(ev, "2026-11", "mrr", "total");
    const p = projectMonth(s, "2026-11", 6);
    expect(p.pastBusinessDays).toBe(5);
    expect(p.remainingBusinessDays).toBe(16);
    expect(p.projected).toBeCloseTo(350 + 70 * 16);
  });

  it("tendência começa em hoje e é nula antes", () => {
    const s = dailySeries(ev, "2026-11", "mrr", "total");
    const t = trendLine(cumulative(s), "2026-11", 6, 10);
    expect(t[4]).toBeNull();
    expect(t[5]).toBe(350);
    expect(t[8]).toBe(360); // dia 9 é segunda (7 e 8 fim de semana)
  });

  it("ritmo dos últimos dias úteis atravessa o mês anterior", () => {
    expect(lastBusinessDaysPace(ev, "2026-11-02", 2, "mrr", "novos")).toBe((200 + 999) / 2);
  });

  it("arredonda vendas meio para cima", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.49)).toBe(2);
  });

  it("campanha e sem campanha são complementares e somam o geral", () => {
    const events: PacingEvent[] = [
      { date: "2026-11-02", kind: "novos", mrr: 200, campaign: true },
      { date: "2026-11-03", kind: "upsell", mrr: 100, campaign: false },
      { date: "2026-11-04", kind: "recuperados", mrr: 50, campaign: true },
    ];
    expect(filterPacingEvents(events, "all")).toHaveLength(3);
    expect(filterPacingEvents(events, "campaign").map((event) => event.mrr)).toEqual([200, 50]);
    expect(filterPacingEvents(events, "non_campaign").map((event) => event.mrr)).toEqual([100]);
  });
});

import { declaredCampaignFuture, declaredTrendLine } from "@/lib/newMrrPacing";
describe("projeção declarada de campanha", () => {
  const daily = Array(31).fill(0); daily[6] = 600; daily[9] = 400; // R$1.000 realizados em 07–11/12
  const projs = [{ start_date: "2026-12-07", end_date: "2026-12-18", mrr: 3000, qty: null }];
  it("divide o saldo pelos dias úteis restantes do período", () => {
    const f = declaredCampaignFuture(projs, "2026-12", daily, 11, "mrr")!;
    expect(f[13]).toBe(400); // 14/12
    expect(f[17]).toBe(400); // 18/12
    expect(f[12]).toBe(0);   // domingo
    expect(f[18]).toBe(0);   // fora do período
    expect(f.reduce((a, b) => a + b, 0)).toBe(2000);
  });
  it("sem valor na métrica retorna null", () => {
    expect(declaredCampaignFuture(projs, "2026-12", daily, 11, "qty")).toBeNull();
  });
  it("tendência termina na projeção declarada", () => {
    const cum = daily.map((_, i) => daily.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const t = declaredTrendLine(cum, declaredCampaignFuture(projs, "2026-12", daily, 11, "mrr")!, 11);
    expect(t[9]).toBeNull();
    expect(t[30]).toBe(3000);
  });
  it("realizado acima da projeção não gera saldo negativo", () => {
    const f = declaredCampaignFuture([{ ...projs[0], mrr: 500 }], "2026-12", daily, 11, "mrr")!;
    expect(f.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
