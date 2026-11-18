import { describe, it, expect } from "vitest";
import { funnelLabel, funnelSourceTag } from "./funnelLabel";

describe("funnelLabel", () => {
  it("marks RD funnels with (RD) in front of the name", () =>
    expect(funnelLabel("[Sales] Time Financeiro", "rd")).toBe("(RD) [Sales] Time Financeiro"));
  it("marks ActiveCampaign funnels with (AC)", () =>
    expect(funnelLabel("[Sales] Time Financeiro (Novo)", "activecampaign")).toBe("(AC) [Sales] Time Financeiro (Novo)"));
  it("treats a missing source as ActiveCampaign (column default)", () =>
    expect(funnelLabel("Outbound", null)).toBe("(AC) Outbound"));
  it("ignores case and blanks in the source", () =>
    expect(funnelSourceTag(" RD ")).toBe("RD"));
  it("keeps a missing title readable", () =>
    expect(funnelLabel(null, "rd")).toBe("(RD) —"));
  it("separates the two same-named Recovery funnels", () => {
    const ac = funnelLabel("[Sales] Recuperação Churn 4blue", "activecampaign");
    const rd = funnelLabel("[Sales] Recuperação Churn 4blue", "rd");
    expect(ac).not.toBe(rd);
    expect([ac, rd]).toEqual(["(AC) [Sales] Recuperação Churn 4blue", "(RD) [Sales] Recuperação Churn 4blue"]);
  });
});
