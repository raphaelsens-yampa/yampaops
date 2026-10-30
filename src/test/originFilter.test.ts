import { describe, expect, it } from "vitest";
import { buildOriginShares, originShareAsOf, stripeConversionOrigin, type OriginShareRow } from "@/lib/origins";

const rows: OriginShareRow[] = [
  { data: "2026-10-20", classificacao: "novos_pagantes", origem_cliente: "yampa", qtd_mtd: 3, mrr_mtd: 600 },
  { data: "2026-10-20", classificacao: "novos_pagantes", origem_cliente: "4blue", qtd_mtd: 1, mrr_mtd: 65 },
  { data: "2026-10-20", classificacao: "novos_pagantes", origem_cliente: "sem_origem", qtd_mtd: 1, mrr_mtd: 100 },
];

describe("filtro de Origem", () => {
  it("venda da Stripe sem marcação é Yampa; marcada 4blue é 4blue", () => {
    expect(stripeConversionOrigin({ origem_cliente: null })).toBe("yampa");
    expect(stripeConversionOrigin({ origem_cliente: "4Blue" })).toBe("4blue");
    expect(stripeConversionOrigin({ attribution_source: "metabase_4blue" })).toBe("4blue");
  });

  it("Yampa + 4blue + sem origem = Visão Geral", () => {
    const y = originShareAsOf(buildOriginShares(rows, "yampa"), "2026-10-20", "novos_pagantes", "qtd")!;
    const b = originShareAsOf(buildOriginShares(rows, "4blue"), "2026-10-20", "novos_pagantes", "qtd")!;
    expect(y).toBeCloseTo(0.6);
    expect(b).toBeCloseTo(0.2);
    expect(y + b).toBeCloseTo(0.8); // os 20% restantes são clientes sem origem
  });
});
