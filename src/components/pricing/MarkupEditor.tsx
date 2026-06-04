import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  derivedFixedExpensePct,
  effectiveLine,
  effectiveMarkupRate,
  fmtNum,
  fmtPct,
  variableSum,
} from "@/lib/pricing/engine";
import { LINE_LABEL } from "@/lib/pricing/types";
import type { MarkupLineKey, PricingSnapshot } from "@/lib/pricing/types";

interface Props {
  snap: PricingSnapshot;
  update: (u: (s: PricingSnapshot) => PricingSnapshot) => void;
}

const FIELDS: { key: keyof PricingSnapshot["markup_lines"]["premium"]; label: string }[] = [
  { key: "tax_pct", label: "Impostos sobre faturamento" },
  { key: "commission_pct", label: "Comissão" },
  { key: "gateway_pct", label: "Gateway" },
  { key: "investment_pct", label: "Investimento" },
  { key: "sales_commission_pct", label: "Comissão comercial média" },
  { key: "fixed_expense_pct", label: "Despesa fixa" },
  { key: "churn_pct", label: "Churn" },
  { key: "profit_pct", label: "% Lucro líquido desejado" },
];

export function MarkupEditor({ snap, update }: Props) {
  const autoFix = !!snap.revenue?.auto_fixed_expense;
  const derivedFix = derivedFixedExpensePct(snap);

  return (
    <div className="space-y-3">
      {autoFix && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <strong>Despesa fixa automática</strong> ligada — usando{" "}
          <Badge variant="secondary">{fmtPct(derivedFix, 2)}</Badge> em todas as
          linhas, derivada do cenário de faturamento na Visão Geral. Desligue lá
          para editar manualmente abaixo.
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(Object.keys(snap.markup_lines) as MarkupLineKey[]).map((k) => {
          const l = snap.markup_lines[k];
          const eff = effectiveLine(snap, l);
          const mk = effectiveMarkupRate(snap, l);
          const varS = variableSum(eff);
          return (
            <Card key={k}>
              <CardHeader>
                <CardTitle>{LINE_LABEL[k]}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Σ variáveis: {fmtPct(varS)} · Mark-up:{" "}
                  <span className="font-bold text-primary">{fmtNum(mk, 2)}x</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {FIELDS.map((f) => {
                  const isAutoField =
                    f.key === "fixed_expense_pct" && autoFix;
                  return (
                    <div key={f.key}>
                      <Label className="text-xs flex items-center gap-1">
                        {f.label}
                        {isAutoField && (
                          <Badge variant="outline" className="text-[10px]">
                            auto
                          </Badge>
                        )}
                      </Label>
                      <Input
                        type="number"
                        step="0.001"
                        disabled={isAutoField}
                        value={isAutoField ? derivedFix.toFixed(4) : l[f.key]}
                        onChange={(e) =>
                          update((s) => ({
                            ...s,
                            markup_lines: {
                              ...s.markup_lines,
                              [k]: {
                                ...s.markup_lines[k],
                                [f.key]: Number(e.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
