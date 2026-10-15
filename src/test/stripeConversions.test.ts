import { describe, expect, it } from "vitest";
import { addedMrr, matchesConversion, subscriptionMrr, conversionPreset, spRange, validDateRange, isCampaignConversion, planChartGroup, matchesType, sellerLabelOf, type FilterableConversion, type ConversionFilters, type CampaignContext } from "@/lib/stripeConversions";
const row: FilterableConversion = { conversion_type: "new", mrr: 399, mrr_net: 279, delta_mrr: 279, area: "Sales", assigned_seller_id: "leticia", is_reactivation: false, coupon_id: "coupon", customer_email: "cliente@exemplo.com" };
const filters: ConversionFilters = { area: "all", type: "all", seller: "all", reactivationOnly: false, couponOnly: false, mode: "net", campaign: "all" };
const campaignCtx: CampaignContext = { couponIds: new Set(["CAMP10"]), manualByEmail: new Map([["manual@exemplo.com", true], ["excluido@exemplo.com", false]]) };
describe("Conversões por Área", () => {
  it("filtra vendedor específico", () => { expect(matchesConversion(row, { ...filters, seller: "eduarda" })).toBe(false); expect(matchesConversion(row, { ...filters, seller: "leticia" })).toBe(true); });
  it("filtra sem vendedor", () => { expect(matchesConversion(row, { ...filters, seller: "none" })).toBe(false); expect(matchesConversion({ ...row, assigned_seller_id: null }, { ...filters, seller: "none" })).toBe(true); });
  it("combina todos os filtros", () => { const f = { ...filters, area: "Sales", type: "new", seller: "leticia", couponOnly: true, reactivationOnly: true }; expect(matchesConversion(row, f)).toBe(false); expect(matchesConversion({ ...row, is_reactivation: true }, f)).toBe(true); expect(matchesConversion({ ...row, is_reactivation: true, area: "CX" }, f)).toBe(false); });
  it("não trata cupom vazio como cupom", () => expect(matchesConversion({ ...row, coupon_id: " " }, { ...filters, couponOnly: true })).toBe(false));
  it("elegibilidade usa o modo selecionado", () => { const free = { ...row, mrr_net: 0 }; expect(matchesConversion(free, filters)).toBe(false); expect(matchesConversion(free, { ...filters, mode: "gross" })).toBe(true); });
  it("fallback líquido preserva zero e só usa bruto quando ausente", () => { expect(subscriptionMrr({ ...row, mrr_net: null }, "net")).toBe(399); expect(subscriptionMrr({ ...row, mrr_net: 0 }, "net")).toBe(0); });
  it("upsell 900 → 1000 contribui 100 sem alterar assinatura", () => { const upsell = { ...row, conversion_type: "upsell", mrr: 1000, mrr_net: 1000, delta_mrr: 100 }; expect(addedMrr(upsell, "net")).toBe(100); expect(subscriptionMrr(upsell, "net")).toBe(1000); });
  it("recuperação conta uma vez e renovação/downsell não acrescem", () => { const recovered = { ...row, is_reactivation: true }; expect(addedMrr(recovered, "net")).toBe(279); for (const type of ["renewal", "downgrade"]) expect(addedMrr({ ...row, conversion_type: type }, "net")).toBe(0); });
  it("este mês não inclui primeiro dia do seguinte", () => expect(conversionPreset("this_month", new Date("2026-10-14T16:00:00Z"))).toEqual({ start: "2026-10-01", end: "2026-10-31" }));
  it("90 dias inclui exatamente 90 datas", () => expect(conversionPreset("last_90", new Date("2026-10-14T16:00:00Z"))).toEqual({ start: "2026-07-17", end: "2026-10-14" }));
  it("presets usam dia São Paulo perto da virada UTC", () => expect(conversionPreset("ytd", new Date("2026-10-15T01:00:00Z")).end).toBe("2026-10-14"));
  it("limites incluem todo último dia no fuso São Paulo", () => expect(spRange({ start: "2026-09-01", end: "2026-09-30" })).toEqual({ from: "2026-09-01T00:00:00-03:00", to: "2026-09-30T23:59:59.999-03:00", until: "2026-10-01T00:00:00-03:00" }));
  it("rejeita datas vazias, impossíveis e invertidas", () => { expect(validDateRange({ start: "", end: "2026-10-01" })).toBe(false); expect(validDateRange({ start: "2026-02-30", end: "2026-10-01" })).toBe(false); expect(validDateRange({ start: "2026-10-02", end: "2026-10-01" })).toBe(false); });
  it("cupom de campanha marca a conversão como campanha", () => { expect(isCampaignConversion({ ...row, coupon_id: "CAMP10" }, campaignCtx)).toBe(true); expect(isCampaignConversion({ ...row, coupon_id: "outro" }, campaignCtx)).toBe(false); });
  it("marcação manual tem precedência sobre o cupom", () => { expect(isCampaignConversion({ ...row, customer_email: " manual@exemplo.com ", coupon_id: "outro" }, campaignCtx)).toBe(true); expect(isCampaignConversion({ ...row, customer_email: "excluido@exemplo.com", coupon_id: "CAMP10" }, campaignCtx)).toBe(false); });
  it("filtro campanha isola entradas de campanha e a negação exclui só elas", () => { const camp = { ...row, coupon_id: "CAMP10" }; const fora = { ...row, coupon_id: "outro" }; expect(matchesConversion(camp, { ...filters, campaign: "campaign", campaignCtx })).toBe(true); expect(matchesConversion(fora, { ...filters, campaign: "campaign", campaignCtx })).toBe(false); expect(matchesConversion(camp, { ...filters, campaign: "non_campaign", campaignCtx })).toBe(false); expect(matchesConversion(fora, { ...filters, campaign: "non_campaign", campaignCtx })).toBe(true); });
  it("gráficos por plano agrupam Time Financeiro e BPO como Time Financeiro", () => { expect(planChartGroup("Time Financeiro com BPO Junior")).toBe("Time Financeiro"); expect(planChartGroup("BPO Pleno")).toBe("Time Financeiro"); expect(planChartGroup("+Controle A Vista")).toBe("+Controle A Vista"); expect(planChartGroup(null)).toBe("Sem plano"); expect(planChartGroup("  ")).toBe("Sem plano"); });
  it("tipo recuperação usa só vendas novas e upsells reativados", () => {
    expect(matchesConversion(row, { ...filters, type: "reactivation" })).toBe(false);
    expect(matchesConversion({ ...row, is_reactivation: true }, { ...filters, type: "reactivation" })).toBe(true);
    expect(matchesConversion({ ...row, is_reactivation: true, conversion_type: "upsell" }, { ...filters, type: "reactivation" })).toBe(true);
    expect(matchesConversion({ ...row, is_reactivation: true, conversion_type: "renewal" }, { ...filters, type: "reactivation" })).toBe(false);
    expect(matchesType({ ...row, is_reactivation: true, conversion_type: "downgrade" }, "reactivation")).toBe(false);
  });
  it("sem vendedor usa o nome da área como vendedor", () => {
    expect(sellerLabelOf({ ...row, assigned_seller_id: null }, { leticia: "Leticia Calor" })).toBe("Sales");
    expect(sellerLabelOf(row, { leticia: "Leticia Calor" })).toBe("Leticia Calor");
    expect(sellerLabelOf({ ...row, assigned_seller_id: "outra", area: "CX" }, { leticia: "Leticia Calor" })).toBe("outra".slice(0, 8));
  });
});