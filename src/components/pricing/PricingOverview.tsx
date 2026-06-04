import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createPricingCtx,
  markupRate,
  fmtBRL,
  fmtPct,
  fmtNum,
} from "@/lib/pricing/engine";
import type { PricingSnapshot } from "@/lib/pricing/types";
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";

export function PricingOverview({ snap }: { snap: PricingSnapshot }) {
  const ctx = useMemo(() => createPricingCtx(snap), [snap]);
  const cpm = ctx.cpm;
  const fixed = ctx.fixed;
  const labor = ctx.labor;
  const calcs = useMemo(
    () => snap.services.map((s) => ({ svc: s, c: ctx.serviceCalc(s) })),
    [snap.services, ctx],
  );
  const counts = useMemo(() => {
    const r = { preco_bom: 0, abaixo_ideal: 0, acima_ideal: 0, prejuizo: 0 };
    calcs.forEach((x) => (r[x.c.status] += 1));
    return r;
  }, [calcs]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Custo fixo mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBRL(fixed)}</div>
            <p className="text-xs text-muted-foreground">{snap.fixed_costs.length + snap.labor_costs.length} linhas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Custo por minuto produtivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBRL(cpm)}</div>
            <p className="text-xs text-muted-foreground">
              {fmtNum(snap.capacity.people, 1)} pessoas · {snap.capacity.hours_per_day}h/dia
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Serviços cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snap.services.length}</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {counts.preco_bom > 0 && (
                <Badge variant="default" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {counts.preco_bom} bons
                </Badge>
              )}
              {counts.abaixo_ideal > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {counts.abaixo_ideal} abaixo
                </Badge>
              )}
              {counts.prejuizo > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {counts.prejuizo} prejuízo
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Insumos / Subprodutos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {snap.inputs.length} / {snap.subproducts.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Markup por linha</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.keys(snap.markup_lines) as Array<keyof typeof snap.markup_lines>).map((k) => {
              const l = snap.markup_lines[k];
              const mk = markupRate(l);
              return (
                <div key={k} className="rounded-lg border p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Linha {k}
                  </div>
                  <div className="text-3xl font-bold mt-1">{fmtNum(mk, 2)}x</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Lucro desejado: {fmtPct(l.profit_pct)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atenção: preços que merecem revisão</CardTitle>
        </CardHeader>
        <CardContent>
          {calcs.filter((x) => x.c.status === "prejuizo" || x.c.status === "abaixo_ideal").length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os serviços estão precificados acima do mínimo. <TrendingUp className="inline h-4 w-4" />
            </p>
          ) : (
            <div className="space-y-2">
              {calcs
                .filter((x) => x.c.status === "prejuizo" || x.c.status === "abaixo_ideal")
                .map(({ svc, c }) => (
                  <div key={svc.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <div className="font-medium">{svc.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Praticado {fmtBRL(c.practiced_monthly)}/mês · Ideal {fmtBRL(c.ideal_price_monthly)}/mês
                      </div>
                    </div>
                    <Badge variant={c.status === "prejuizo" ? "destructive" : "secondary"}>
                      {fmtPct(c.delta_vs_ideal_pct)}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
