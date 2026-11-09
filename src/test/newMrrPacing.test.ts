import { describe, it, expect } from "vitest";
import { dailySeries, cumulative, projectMonth, roundHalfUp, trendLine, lastBusinessDaysPace, type PacingEvent } from "@/lib/newMrrPacing";

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
});
