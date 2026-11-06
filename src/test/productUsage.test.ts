import { describe, expect, it } from "vitest";
import { missingColumns, parseUsageRecords, referenceDateFromFileName, usageByEmail, USAGE_COLUMNS } from "@/lib/productUsage";
import { eligibleClients, type BaseClient, type ExpansionTrack } from "@/lib/baseExpansion";

const rec = (o: Record<string, string>) => Object.fromEntries(USAGE_COLUMNS.map((c) => [c, o[c] ?? ""]));

describe("productUsage", () => {
  it("reads the template columns and Brazilian date", () => {
    const [r] = parseUsageRecords([rec({ "Company ID": "86282980", "E-mail": "A@X.com", IE: "43.3", Tier: "engajado", "Última atividade": "05/11/2026", "Módulos": "7" })]);
    expect(r).toMatchObject({ company_id: "86282980", email: "a@x.com", ie: 43.3, tier: "engajado", ultima_atividade: "2026-11-05", modulos: 7 });
  });
  it("flags a file missing template columns", () => {
    expect(missingColumns(["Company ID", "E-mail"])).toContain("IE");
  });
  it("takes the reference date from the file name", () => {
    expect(referenceDateFromFileName("usage_empresas_2026-11-06.csv")).toBe("2026-11-06");
  });
  it("keeps the highest IE company per e-mail", () => {
    const m = usageByEmail([{ email: "a@x.com", ie: 10 }, { email: "a@x.com", ie: 80 }]);
    expect(m.get("a@x.com")?.ie).toBe(80);
  });
  it("track restricted to usage tiers excludes other tiers and clients without data", () => {
    const base: BaseClient[] = [
      { email: "1", company_name: null, plano: "CONTROL", mrr: 100, tenure_days: 100, origem_cliente: null, usage_tier: "alto" },
      { email: "2", company_name: null, plano: "CONTROL", mrr: 100, tenure_days: 100, origem_cliente: null, usage_tier: "desengajado" },
      { email: "3", company_name: null, plano: "CONTROL", mrr: 100, tenure_days: 100, origem_cliente: null },
    ];
    const t: ExpansionTrack = { key: "k", label: "U", kind: "upsell", eligiblePlans: ["CONTROL"], minTenureDays: 0, usageTiers: ["alto"], adoptionPct: { pessimista: 0, realista: 0, otimista: 0 } };
    expect(eligibleClients(base, t).map((c) => c.email)).toEqual(["1"]);
    expect(eligibleClients(base, { ...t, usageTiers: [] })).toHaveLength(3);
  });
});
