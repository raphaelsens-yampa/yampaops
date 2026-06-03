import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { costPerMinute, fmtBRL, fmtNum, totalFixedCost } from "@/lib/pricing/engine";
import type { PricingSnapshot } from "@/lib/pricing/types";

interface Props {
  snap: PricingSnapshot;
  update: (u: (s: PricingSnapshot) => PricingSnapshot) => void;
}

export function CapacityEditor({ snap, update }: Props) {
  const c = snap.capacity;
  const minutes = c.people * c.hours_per_day * 60 * c.work_days * c.productivity_pct;
  const cpm = costPerMinute(snap);
  const fixed = totalFixedCost(snap);

  const set = (patch: Partial<typeof c>) =>
    update((s) => ({ ...s, capacity: { ...s.capacity, ...patch } }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Capacidade Produtiva</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Pessoas produtivas</Label>
            <Input
              type="number"
              step="0.5"
              value={c.people}
              onChange={(e) => set({ people: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Horas diárias máximas produtivas</Label>
            <Input
              type="number"
              step="0.5"
              value={c.hours_per_day}
              onChange={(e) => set({ hours_per_day: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Dias trabalhados / ano</Label>
            <Input
              type="number"
              value={c.work_days}
              onChange={(e) => set({ work_days: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>% Produtividade (0 a 1)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={c.productivity_pct}
              onChange={(e) => set({ productivity_pct: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Minutos produtivos / ano" value={fmtNum(minutes, 0)} />
          <Row label="Custo fixo + mão de obra (mês)" value={fmtBRL(fixed)} />
          <Row label="Custo fixo anualizado" value={fmtBRL(fixed * 12)} />
          <div className="pt-3 border-t">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Custo por minuto produtivo
            </div>
            <div className="text-3xl font-bold text-primary">{fmtBRL(cpm)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
