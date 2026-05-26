export type DiscountTier = {
  id: string;
  name: string;
  tpv_min: number;
  tpv_max: number | null;
  discount_value: number;
  position: number;
  is_active: boolean;
};

export type PlanType = "software" | "consultoria_bpo";

export function applicableBase(planType: PlanType, basePrice: number, embeddedValue: number) {
  return planType === "consultoria_bpo" ? (embeddedValue || 0) : (basePrice || 0);
}

export function findTier(tiers: DiscountTier[], tpv: number): DiscountTier | null {
  const active = tiers.filter((t) => t.is_active);
  const matches = active.filter(
    (t) => tpv >= t.tpv_min && (t.tpv_max === null || tpv <= t.tpv_max),
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.tpv_min - a.tpv_min)[0];
}

export function calcDiscount(
  tiers: DiscountTier[],
  planType: PlanType,
  basePrice: number,
  embeddedValue: number,
  tpv: number,
) {
  const base = applicableBase(planType, basePrice, embeddedValue);
  const tier = findTier(tiers, tpv);
  const rawDiscount = tier ? tier.discount_value : 0;
  const discount = Math.min(rawDiscount, base);
  const finalValue = Math.max(0, (basePrice || 0) - discount);
  return { tier, discount, base, originalValue: basePrice || 0, finalValue };
}

export function nextTier(tiers: DiscountTier[], tpv: number): DiscountTier | null {
  const active = tiers.filter((t) => t.is_active).sort((a, b) => a.tpv_min - b.tpv_min);
  return active.find((t) => t.tpv_min > tpv) ?? null;
}

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function currentMonthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
