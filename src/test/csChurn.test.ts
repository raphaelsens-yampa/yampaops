import { describe, it, expect } from "vitest";
import { churnedClients, filterByChurnWindow, isStale } from "@/lib/csChurn";
const r = (email: string, churned_at: string | null = null, mrr = 100) => ({ id: email + churned_at, email, mrr, churned_at } as any);
describe("csChurn", () => {
  it("cliente com troca de plano ainda ativo não é churn", () => {
    expect(churnedClients([r("a@x.com")], [r("A@x.com", "2026-11-01")])).toHaveLength(0);
  });
  it("mantém só a saída mais recente por e-mail", () => {
    const out = churnedClients([], [r("b@x.com", "2026-10-01", 50), r("b@x.com", "2026-11-05", 90)]);
    expect(out).toHaveLength(1);
    expect(out[0].mrr).toBe(90);
  });
  it("churn recente = últimos 90 dias", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const out = filterByChurnWindow([r("c", "2026-11-01"), r("d", "2026-07-01")], 90, now);
    expect(out.map((x) => x.email)).toEqual(["c"]);
  });
  it("base com mais de 1 dia fica em alerta", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    expect(isStale("2026-11-12T11:40:00Z", now)).toBe(false);
    expect(isStale("2026-11-10T11:40:00Z", now)).toBe(true);
  });
});
