import { describe, it, expect } from "vitest";
import { acquisitionChannelByEmail } from "@/lib/churnAnalysis";

describe("acquisitionChannelByEmail", () => {
  it("usa a área da primeira venda nova do cliente", () => {
    const m = acquisitionChannelByEmail([
      { customer_email: "A@x.com", area: "Produto", converted_at: "2026-05-01" },
      { customer_email: "a@x.com", area: "Sales", converted_at: "2026-02-01" },
    ]);
    expect(m.get("a@x.com")).toBe("Sales");
  });
  it("área desconhecida vira Não identificado", () => {
    const m = acquisitionChannelByEmail([{ customer_email: "b@x.com", area: "desconhecida", converted_at: "2026-01-01" }]);
    expect(m.get("b@x.com")).toBe("Não identificado");
  });
});
