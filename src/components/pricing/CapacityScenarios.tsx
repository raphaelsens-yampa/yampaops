import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  createPricingCtx,
  fmtBRL,
  fmtNum,
  serviceCost,
} from "@/lib/pricing/engine";
import type { PricingSnapshot, RecipeRef, Service } from "@/lib/pricing/types";

/** Minutos consumidos por 1 contrato do serviço — soma recursiva da ficha. */
function serviceMinutes(snap: PricingSnapshot, svc: Service): number {
  const inputMin = new Map(snap.inputs.map((i) => [i.id, Number(i.minutes) || 0]));
  const subMin = new Map<string, number>();
  const subById = new Map(snap.subproducts.map((s) => [s.id, s]));
  const visiting = new Set<string>();

  const refMin = (r: RecipeRef): number => {
    const qty = Number(r.qty) || 0;
    if (!qty) return 0;
    if (r.kind === "input") return qty * (inputMin.get(r.ref) ?? 0);
    return qty * subMinutes(r.ref);
  };

  function subMinutes(id: string): number {
    const c = subMin.get(id);
    if (c !== undefined) return c;
    if (visiting.has(id)) return 0;
    const s = subById.get(id);
    if (!s) return 0;
    visiting.add(id);
    let t = 0;
    for (const it of s.items ?? []) t += refMin(it);
    visiting.delete(id);
    subMin.set(id, t);
    return t;
  }

  return svc.recipe.reduce((s, r) => s + refMin(r), 0);
}

interface MixRow {
  service_id: string;
  share: number; // % do mix, 0..100
}

export function CapacityScenarios({ snap }: { snap: PricingSnapshot }) {
  const c = snap.capacity;
  const minutesPerYear =
    c.people * c.hours_per_day * 60 * c.work_days * c.productivity_pct;
  const minutesPerMonth = minutesPerYear / 12;
  const ctx = useMemo(() => createPricingCtx(snap), [snap]);

  // Tabela: por serviço, minutos por contrato, custo, preço, quantos cabem/mês.
  const rows = useMemo(() => {
    return snap.services
      .filter((s) => s.active !== false)
      .map((s) => {
        const totalMin = serviceMinutes(snap, s);
        const months = Math.max(1, s.contract_months);
        const minPerMonth = totalMin / months;
        const calc = ctx.serviceCalc(s);
        return {
          svc: s,
          totalMin,
          minPerMonth,
          maxUnits: minPerMonth > 0 ? minutesPerMonth / minPerMonth : 0,
          monthlyRevenue:
            minPerMonth > 0
              ? (minutesPerMonth / minPerMonth) * calc.practiced_monthly
              : 0,
          calc,
        };
      })
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  }, [snap, ctx, minutesPerMonth]);

  // Cenário customizado: mix de serviços com % da capacidade.
  const defaultMix: MixRow[] = [];
  const [mix, setMix] = useState<MixRow[]>(defaultMix);

  const mixResult = useMemo(() => {
    const totalShare = mix.reduce((s, m) => s + m.share, 0);
    const items = mix.map((m) => {
      const svc = snap.services.find((s) => s.id === m.service_id);
      if (!svc) return null;
      const totalMin = serviceMinutes(snap, svc);
      const months = Math.max(1, svc.contract_months);
      const minPerMonth = totalMin / months;
      const allottedMin = minutesPerMonth * (m.share / 100);
      const units = minPerMonth > 0 ? allottedMin / minPerMonth : 0;
      const calc = ctx.serviceCalc(svc);
      return {
        svc,
        share: m.share,
        units,
        revenue: units * calc.practiced_monthly,
        cost: units * (serviceCost(snap, svc) / months),
      };
    }).filter(Boolean) as Array<{
      svc: Service; share: number; units: number; revenue: number; cost: number;
    }>;
    return {
      totalShare,
      revenue: items.reduce((s, x) => s + x.revenue, 0),
      cost: items.reduce((s, x) => s + x.cost, 0),
      items,
    };
  }, [mix, snap, ctx, minutesPerMonth]);

  const addMix = () =>
    setMix((m) => [
      ...m,
      { service_id: snap.services[0]?.id ?? "", share: Math.max(0, 100 - m.reduce((s, x) => s + x.share, 0)) },
    ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Capacidade mensal disponível</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Minutos / mês" value={fmtNum(minutesPerMonth, 0)} />
            <Stat label="Pessoas" value={fmtNum(c.people, 1)} />
            <Stat label="Produtividade" value={`${(c.productivity_pct * 100).toFixed(0)}%`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por serviço — se o time só vendesse este</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quantos contratos cabem na capacidade mensal e qual seria o faturamento previsto.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead className="text-right">Min/mês por contrato</TableHead>
                <TableHead className="text-right">Cabem/mês</TableHead>
                <TableHead className="text-right">Preço/mês</TableHead>
                <TableHead className="text-right">Receita máx/mês</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhum serviço ativo cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.svc.id}>
                  <TableCell className="font-medium">{r.svc.name}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.minPerMonth, 1)}</TableCell>
                  <TableCell className="text-right">{fmtNum(r.maxUnits, 1)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(r.calc.practiced_monthly)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtBRL(r.monthlyRevenue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>Mix customizado</span>
            <Button size="sm" variant="outline" onClick={addMix}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar serviço
            </Button>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Distribua a capacidade entre vários serviços (% do tempo do time).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {mix.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Adicione serviços ao mix para simular cenários (só financeiro, só BPO, misto…).
            </p>
          )}
          {mix.map((m, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-7">
                <Label className="text-xs">Serviço</Label>
                <Select
                  value={m.service_id}
                  onValueChange={(v) =>
                    setMix((arr) => arr.map((x, idx) => (idx === i ? { ...x, service_id: v } : x)))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {snap.services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">% da capacidade</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={m.share}
                  onChange={(e) =>
                    setMix((arr) =>
                      arr.map((x, idx) => (idx === i ? { ...x, share: Number(e.target.value) } : x)),
                    )
                  }
                />
              </div>
              <div className="col-span-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setMix((arr) => arr.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {mix.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  Total alocado:{" "}
                  <Badge variant={mixResult.totalShare === 100 ? "default" : "secondary"}>
                    {mixResult.totalShare}%
                  </Badge>
                </span>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Receita mix/mês</div>
                  <div className="text-2xl font-bold text-primary">
                    {fmtBRL(mixResult.revenue)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Margem bruta estimada:{" "}
                <strong>{fmtBRL(mixResult.revenue - mixResult.cost)}/mês</strong>{" "}
                ({mixResult.revenue > 0 ? ((1 - mixResult.cost / mixResult.revenue) * 100).toFixed(1) : 0}%)
              </div>
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-right">Contratos/mês</TableHead>
                    <TableHead className="text-right">Receita/mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mixResult.items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{it.svc.name}</TableCell>
                      <TableCell className="text-right">{fmtNum(it.units, 1)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(it.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
