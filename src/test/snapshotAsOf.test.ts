import { describe, it, expect } from "vitest";
import { resolveSnapshotAsOf, monthEndKey } from "@/lib/snapshotAsOf";

const base = { metric_key: "total_mrr", scope: "company" };

describe("resolveSnapshotAsOf", () => {
  it("calcula o último dia do mês", () => {
    expect(monthEndKey("2026-07-01")).toBe("2026-07-31");
    expect(monthEndKey("2026-02-01")).toBe("2026-02-28");
  });

  it("ignora carry_forward posterior ao fim do mês e mantém o fechamento", () => {
    const rows = [
      { ...base, year_month: "2026-07-01", data: "2026-07-30", tipo_snapshot: "parcial", v: 322970.11 },
      { ...base, year_month: "2026-07-01", data: "2026-07-31", tipo_snapshot: "fechamento", v: 324828.55 },
      { ...base, year_month: "2026-07-01", data: "2026-08-01", tipo_snapshot: "carry_forward", v: 324273.7 },
    ];
    const out = resolveSnapshotAsOf(rows, "2026-09-01");
    expect(out).toHaveLength(1);
    expect(out[0].v).toBe(324828.55);
  });

  it("no mês em curso usa o valor do dia de referência", () => {
    const rows = [
      { ...base, year_month: "2026-09-01", data: "2026-09-01", tipo_snapshot: "parcial", v: 10 },
      { ...base, year_month: "2026-09-01", data: "2026-09-02", tipo_snapshot: "parcial", v: 20 },
    ];
    expect(resolveSnapshotAsOf(rows, "2026-09-01")[0].v).toBe(10);
    expect(resolveSnapshotAsOf(rows, "2026-09-02")[0].v).toBe(20);
  });
});
