import { describe, it, expect } from "vitest";
import { isConfirmedConversion } from "@/lib/stripeConversions";

describe("isConfirmedConversion", () => {
  it("conta venda paga", () => expect(isConfirmedConversion({ payment_status: "paid" })).toBe(true));
  it("não conta venda com pagamento falho", () => expect(isConfirmedConversion({ payment_status: "failed" })).toBe(false));
  it("não conta venda pendente", () => expect(isConfirmedConversion({ payment_status: "pending" })).toBe(false));
});
