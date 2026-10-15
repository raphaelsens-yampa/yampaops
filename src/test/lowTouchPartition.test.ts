import { describe, expect, test } from "vitest";
import { partitionLowTouch, type RawConversion } from "@/components/goals/tactical/useLowTouchData";

const labelByPrice = new Map<string, string>([
  ["price_produto", "Produto"],
  ["price_sales", "Sales"],
]);
const activeLabels = new Set(["Produto"]);

function row(overrides: Partial<RawConversion>): RawConversion {
  return {
    id: "r1",
    customer_email: "cliente@teste.com",
    plan_name: "+Controle",
    product_name: null,
    converted_at: "2026-10-15 18:57:15+00",
    mrr: 159,
    mrr_net: 159,
    net_amount: null,
    gross_amount: null,
    stripe_price_id: "price_produto",
    conversion_type: "new",
    delta_mrr: null,
    ...overrides,
  };
}

describe("partitionLowTouch", () => {
  test("venda nova Low-touch entra em sales com o MRR cobrado", () => {
    const { sales, upsells } = partitionLowTouch([row({})], labelByPrice, activeLabels);
    expect(sales).toHaveLength(1);
    expect(sales[0].mrr).toBe(159);
    expect(sales[0].dateKey).toBe("2026-10-15");
    expect(upsells).toHaveLength(0);
  });

  test("upsell Low-touch conta como Upsell com o delta de MRR, não como venda", () => {
    const { sales, upsells } = partitionLowTouch(
      [row({ conversion_type: "upsell", delta_mrr: 30, id: "r-up" })],
      labelByPrice,
      activeLabels,
    );
    expect(sales).toHaveLength(0);
    expect(upsells).toHaveLength(1);
    expect(upsells[0].mrr).toBe(30);
    expect(upsells[0].dateKey).toBe("2026-10-15");
  });

  test("renovação Low-touch não conta nem como venda nem como Upsell", () => {
    const { sales, upsells } = partitionLowTouch(
      [row({ conversion_type: "renewal", delta_mrr: 0 })],
      labelByPrice,
      activeLabels,
    );
    expect(sales).toHaveLength(0);
    expect(upsells).toHaveLength(0);
  });

  test("upsell com delta 0 ou negativo não conta como Upsell", () => {
    const { upsells } = partitionLowTouch(
      [
        row({ conversion_type: "upsell", delta_mrr: 0, id: "r-a" }),
        row({ conversion_type: "upsell", delta_mrr: -10, id: "r-b" }),
      ],
      labelByPrice,
      activeLabels,
    );
    expect(upsells).toHaveLength(0);
  });

  test("área não ativa como Low-touch fica fora das duas listas", () => {
    const { sales, upsells } = partitionLowTouch(
      [row({ stripe_price_id: "price_sales" })],
      labelByPrice,
      activeLabels,
    );
    expect(sales).toHaveLength(0);
    expect(upsells).toHaveLength(0);
  });
});
