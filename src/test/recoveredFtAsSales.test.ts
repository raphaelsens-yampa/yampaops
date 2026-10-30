import { describe, expect, it } from "vitest";
import { realizedCountMetricKeys } from "@/components/goals/tactical/useTacticalRealized";

/**
 * Recuperados FT são CNPJs que não eram clientes e não converteram durante os
 * dias de free trial: contam como venda nova no Metas Táticas.
 */
describe("Recuperados FT contam como venda nova", () => {
  it("soma na métrica de Vendas além da própria métrica", () => {
    expect(realizedCountMetricKeys("recuperados_ft")).toEqual(["recuperados_ft", "vendas_dia"]);
  });

  it("não duplica a venda nova, que já é venda", () => {
    expect(realizedCountMetricKeys("vendas_dia")).toEqual(["vendas_dia"]);
  });

  it("não transforma upsell em venda", () => {
    expect(realizedCountMetricKeys("upsell_dia")).toEqual(["upsell_dia"]);
  });
});
