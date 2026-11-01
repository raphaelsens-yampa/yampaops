import { describe, it, expect } from "vitest";
import {
  classifyRecoveries,
  pickBaseDate,
  pruneRecoverySelection,
  setAllRecoverySelection,
  toggleRecoverySelection,
} from "@/lib/recoveryReconciliation";

const base = new Map([["2026-10-25", new Set(["ja@base.com"])]]);
const baseOf = () => "2026-10-25";

describe("classifyRecoveries", () => {
  it("cliente que já estava na base só preserva, não soma MRR oficial", () => {
    const r = classifyRecoveries([{ id: "1", email: "JA@base.com", recoveredAt: "2026-10-26", mrr: 279 }], baseOf, base);
    expect(r.official.mrr).toBe(0);
    expect(r.preserved.mrr).toBe(279);
  });
  it("cliente fora da base entra no MRR oficial", () => {
    const r = classifyRecoveries([{ id: "2", email: "novo@x.com", recoveredAt: "2026-10-26", mrr: 120.73 }], baseOf, base);
    expect(r.official).toEqual({ qty: 1, mrr: 120.73 });
  });
  it("declarado = oficial + preservado", () => {
    const r = classifyRecoveries(
      [
        { id: "1", email: "ja@base.com", recoveredAt: "2026-10-26", mrr: 100 },
        { id: "2", email: "novo@x.com", recoveredAt: "2026-10-26", mrr: 50 },
      ],
      baseOf,
      base,
    );
    expect(r.declared).toEqual({ qty: 2, mrr: 150 });
  });
});

describe("pickBaseDate", () => {
  it("usa a foto anterior mais próxima", () => {
    expect(pickBaseDate("2026-10-27", ["2026-10-24", "2026-10-25", "2026-10-27"])).toBe("2026-10-25");
  });
});

describe("seleção em lote de recuperações", () => {
  it("inclui e remove um cliente da seleção", () => {
    const once = toggleRecoverySelection([], "a");
    expect(once).toEqual(["a"]);
    expect(toggleRecoverySelection(once, "a")).toEqual([]);
    expect(toggleRecoverySelection(once, "b")).toEqual(["a", "b"]);
  });
  it("marca e desmarca todos os clientes listados", () => {
    const ids = ["a", "b", "c"];
    expect(setAllRecoverySelection(ids, true)).toEqual(ids);
    expect(setAllRecoverySelection(ids, false)).toEqual([]);
  });
  it("descarta seleção de clientes que saíram da lista", () => {
    expect(pruneRecoverySelection(["a", "b", "c"], ["a", "c"])).toEqual(["a", "c"]);
  });
});
