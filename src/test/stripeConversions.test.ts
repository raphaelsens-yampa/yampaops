import { describe, expect, it } from "vitest";
import { addedMrr, matchesConversion, subscriptionMrr, conversionPreset, spRange, validDateRange, type FilterableConversion, type ConversionFilters } from "@/lib/stripeConversions";
const row: FilterableConversion = { conversion_type: "new", mrr: 399, mrr_net: 279, delta_mrr: 279, area: "Sales", assigned_seller_id: "leticia", is_reactivation: false, coupon_id: "coupon" };
const filters: ConversionFilters = { area: "all", type: "all", seller: "all", reactivationOnly: false, couponOnly: false, mode: "net" };
describe("Conversões por Área", () => {
  it("filtra vendedor específico", () => { expect(matchesConversion(row, { ...filters, seller: "eduarda" })).toBe(false); expect(matchesConversion(row, { ...filters, seller: "leticia" })).toBe(true); });
  it("filtra sem vendedor", () => { expect(matchesConversion(row, { ...filters, seller: "none" })).toBe(false); expect(matchesConversion({ ...row, assigned_seller_id: null }, { ...filters, seller: "none" })).toBe(true); });
  it("combina todos os filtros", () => { const f = { ...filters, area: "Sales", type: "new", seller: "leticia", couponOnly: true, reactivationOnly: true }; expect(matchesConversion(row, f)).toBe(false); expect(matchesConversion({ ...row, is_reactivation: true }, f)).toBe(true); expect(matchesConversion({ ...row, is_reactivation: true, area: "CX" }, f)).toBe(false); });
  it("não trata cupom vazio como cupom", () => expect(matchesConversion({ ...row, coupon_id: " " }, { ...filters, couponOnly: true })).toBe(false));
  it("elegibilidade usa o modo selecionado", () => { const free = { ...row, mrr_net: 0 }; expect(matchesConversion(free, filters)).toBe(false); expect(matchesConversion(free, { ...filters, mode: "gross" })).toBe(true); });
  it("fallback líquido preserva zero e só usa bruto quando ausente", () => { expect(subscriptionMrr({ ...row, mrr_net: null }, "net")).toBe(399); expect(subscriptionMrr({ ...row, mrr_net: 0 }, "net")).toBe(0); });
  it("upsell 900 → 1000 contribui 100 sem alterar assinatura", () => { const upsell = { ...row, conversion_type: "upsell", mrr: 1000, mrr_net: 1000, delta_mrr: 100 }; expect(addedMrr(upsell, "net")).toBe(100); expect(subscriptionMrr(upsell, "net")).toBe(1000); });
  it("recuperação conta uma vez e renovação/downsell não acrescem", () => { expect(addedMrr({ ...row, is_reactivation: true }, "net")).toBe(279); for (const type of ["renewal", "downgrade"]) expect(addedMrr({ ...row, conversion_type: type }, "net")).toBe(0); });
  it("este mês não inclui primeiro dia do seguinte", () => expect(conversionPreset("this_month", new Date("2026-10-14T16:00:00Z"))).toEqual({ start: "2026-10-01", end: "2026-10-31" }));
  it("90 dias inclui exatamente 90 datas", () => expect(conversionPreset("last_90", new Date("2026-10-14T16:00:00Z"))).toEqual({ start: "2026-07-17", end: "2026-10-14" }));
  it("presets usam dia São Paulo perto da virada UTC", () => expect(conversionPreset("ytd", new Date("2026-10-15T01:00:00Z")).end).toBe("2026-10-14"));
  it("limites incluem todo último dia no fuso São Paulo", () => expect(spRange({ start: "2026-09-01", end: "2026-09-30" })).toEqual({ from: "2026-09-01T00:00:00-03:00", to: "2026-09-30T23:59:59.999-03:00", until: "2026-10-01T00:00:00-03:00" }));
  it("rejeita datas vazias, impossíveis e invertidas", () => { expect(validDateRange({ start: "", end: "2026-10-01" })).toBe(false); expect(validDateRange({ start: "2026-02-30", end: "2026-10-01" })).toBe(false); expect(validDateRange({ start: "2026-10-02", end: "2026-10-01" })).toBe(false); });
});