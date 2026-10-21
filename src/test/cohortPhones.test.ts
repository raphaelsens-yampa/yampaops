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
});