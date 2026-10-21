import { describe, expect, it } from "vitest";
import { cohortPhoneMap } from "@/lib/cohortPhones";

describe("campaign client phones", () => {
  it("matches normalized emails and uses the first available source without duplicating clients", () => {
    const phones = cohortPhoneMap([
      [{ email: " A@example.com ", phone: " 11999999999 " }, { email: "b@example.com", phone: "" }],
      [{ email: "a@example.com", phone: "11888888888" }, { email: "b@example.com", phone: "+5511777777777" }],
    ]);
    expect([...phones]).toEqual([["a@example.com", "11999999999"], ["b@example.com", "+5511777777777"]]);
    expect(phones.get("missing@example.com")).toBeUndefined();
  });

  it("prefers the phone saved by the live Stripe lookup over CRM, Chatwoot, sales campaigns and the Metabase bases", () => {
    const stripe = [{ email: "a@example.com", phone: "+5511900000001" }];
    const crm = [{ email: "a@example.com", phone: "+5511900000002" }, { email: "b@example.com", phone: "+5511900000003" }];
    const chatwoot = [{ email: "b@example.com", phone: "+5511900000004" }, { email: "c@example.com", phone: "+5511900000005" }];
    const sales = [{ email: "c@example.com", phone: "+5511900000006" }, { email: "d@example.com", phone: "+5511900000007" }];
    const preChurn = [{ email: "d@example.com", phone: "+5511900000008" }, { email: "e@example.com", phone: "+5511900000009" }];
    const churn = [{ email: "e@example.com", phone: "+5511900000010" }, { email: "f@example.com", phone: "+5511900000011" }];

    const phones = cohortPhoneMap([stripe, crm, chatwoot, sales, preChurn, churn]);

    expect(phones.get("a@example.com")).toBe("+5511900000001");
    expect(phones.get("b@example.com")).toBe("+5511900000003");
    expect(phones.get("c@example.com")).toBe("+5511900000005");
    expect(phones.get("d@example.com")).toBe("+5511900000007");
    expect(phones.get("e@example.com")).toBe("+5511900000009");
    expect(phones.get("f@example.com")).toBe("+5511900000011");
  });

  it("skips sources whose phone is empty, blank or null and keeps the first real phone", () => {
    const phones = cohortPhoneMap([
      [{ email: "a@example.com", phone: null }],
      [{ email: "a@example.com", phone: "   " }],
      [{ email: "a@example.com", phone: "+5511912345678" }],
      [{ email: "a@example.com", phone: "+5511900000000" }],
    ]);
    expect(phones.get("a@example.com")).toBe("+5511912345678");
  });
});