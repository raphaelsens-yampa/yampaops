import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import {
  derivedFixedExpensePct,
  fmtBRL,
  fmtNum,
  fmtPct,
  revenueBaseMonthly,
  effectiveMarkupRate,
  totalFixedCost,
} from "@/lib/pricing/engine";
import type { PricingSnapshot, RevenueScenario } from "@/lib/pricing/types";

interface Props {
  snap: PricingSnapshot;
  update: (u: (s: PricingSnapshot) => PricingSnapshot) => void;
}

const defaultRev: RevenueScenario = {
  forecasted_monthly: 75000,
  actual_monthly: 43526.1,
  mode: "forecast",
  auto_fixed_expense: false,
};

export function RevenueScenarioCard({ snap, update }: Props) {
  const rev = snap.revenue ?? defaultRev;
  const base = revenueBaseMonthly({ ...snap, revenue: rev });
  const derived = derivedFixedExpensePct({ ...snap, revenue: rev });
  const fixed = totalFixedCost(snap);

  const setRev = (patch: Partial<RevenueScenario>) =>
    update((s) => ({ ...s, revenue: { ...(s.revenue ?? defaultRev), ...patch } }));

  const lines = (["premium", "gold", "prata"] as const).map((k) => {
    const mk = effectiveMarkupRate({ ...snap, revenue: rev }, snap.markup_lines[k]);
    return { k, mk };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>Cenário de faturamento</span>
          <ToggleGroup
            type="single"
            value={rev.mode}
            onValueChange={(v) => v && setRev({ mode: v as "forecast" | "actual" })}
            size="sm"
          >
            <ToggleGroupItem value="forecast">Previsto</ToggleGroupItem>
            <ToggleGroupItem value="actual">Real hoje</ToggleGroupItem>
          </ToggleGroup>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Faturamento previsto (mensal)</Label>
            <Input
              type="number"
              step="100"
              value={rev.forecasted_monthly}
              onChange={(e) => setRev({ forecasted_monthly: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Meta / capacidade plena do time.
            </p>
          </div>
          <div>
            <Label className="text-xs">Faturamento real (mensal)</Label>
            <Input
              type="number"
              step="100"
              value={rev.actual_monthly}
              onChange={(e) => setRev({ actual_monthly: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              O quanto está sendo faturado de fato no setor.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Switch
                id="auto-fix"
                checked={rev.auto_fixed_expense}
                onCheckedChange={(v) => setRev({ auto_fixed_expense: v })}
              />
              <Label htmlFor="auto-fix" className="cursor-pointer">
                Calcular <strong>despesa fixa %</strong> automaticamente
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              despesa fixa ÷ faturamento ={" "}
              <strong>{fmtBRL(fixed)}</strong> ÷ <strong>{fmtBRL(base)}</strong> ={" "}
              <Badge variant="secondary">{fmtPct(derived, 2)}</Badge>
            </p>
          </div>
          <div className="flex gap-4 text-center">
            {lines.map(({ k, mk }) => (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {k}
                </div>
                <div className="text-xl font-bold text-primary">{fmtNum(mk, 2)}x</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
