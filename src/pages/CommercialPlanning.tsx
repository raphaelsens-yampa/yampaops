import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useGoalScenario } from "@/hooks/useGoalScenario";
import {
  useCommercialPlan,
  useFunnelKpis,
  useSellerMonthHistory,
} from "@/hooks/useCommercialPlan";
import { buildPlanMonths, planWindow } from "@/lib/commercialPlan";
import { averageFunnelKpis } from "@/lib/commercialPlan";
import { PlanMrrBridge } from "@/components/planning/PlanMrrBridge";
import { QuotasPanel } from "@/components/planning/QuotasPanel";
import { PipelineCoverage } from "@/components/planning/PipelineCoverage";

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const SCENARIO_PRESETS = [0, 5, 10];

export default function CommercialPlanningPage() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "tatico";
  const plan = useCommercialPlan();
  const sellerHistory = useSellerMonthHistory(plan.sellers);
  const { growthPct, setScenario, active: scenarioActive } = useGoalScenario();

  const [funnelId, setFunnelId] = useState("");
  const funnel = useFunnelKpis(funnelId);

  useEffect(() => {
    if (!funnelId && funnel.funnels.length) {
      const connected = funnel.funnels.find((f) => f.is_connected) || funnel.funnels[0];
      setFunnelId(connected.ac_group_id);
    }
  }, [funnel.funnels, funnelId]);

  const windowMonths = useMemo(() => planWindow(), []);
  const currentMonth = windowMonths.find((m) => m === windowMonths[3]) || windowMonths[0];

  const funnelAvg = useMemo(() => averageFunnelKpis(funnel.kpis), [funnel.kpis]);

  const rows = useMemo(
    () =>
      buildPlanMonths({
        window: windowMonths,
        realized: plan.realized,
        baselines: plan.baselines,
        overrides: Object.fromEntries(plan.overridesByMonth),
        overrideGrowthPct: growthPct > 0 ? growthPct : null,
        avgChurn: plan.avgChurn,
        avgTicket: funnelAvg.avgTicket,
      }),
    [windowMonths, plan.realized, plan.baselines, plan.overridesByMonth, growthPct, plan.avgChurn, funnelAvg.avgTicket],
  );

  const [customPct, setCustomPct] = useState("");
  const lastRealizedLabel = plan.lastRealizedMonth
    ? `${plan.lastRealizedMonth.yearMonth}: ${fmtBRL(plan.lastRealizedMonth.totalMrr)}`
    : null;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading font-bold text-xl md:text-2xl">Planejamento Comercial</h1>
            <p className="text-sm text-muted-foreground">
              Plano de MRR (12 meses), quotas por vendedor e cobertura de pipeline.
              {lastRealizedLabel && ` Último MRR oficial: ${lastRealizedLabel}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Cenário:</span>
            {SCENARIO_PRESETS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={growthPct === p ? "default" : "outline"}
                onClick={() => setScenario(p)}
              >
                {p === 0 ? "Cadastrado" : `+${p}% a.m.`}
              </Button>
            ))}
            <Input
              className="w-24 h-8 text-right"
              placeholder="custom %"
              inputMode="decimal"
              value={customPct}
              onChange={(e) => setCustomPct(e.target.value)}
              onBlur={() => {
                const v = Number(customPct.replace(",", "."));
                if (isFinite(v) && v > 0) setScenario(v);
                else if (customPct.trim() === "") setScenario(0);
              }}
            />
          </div>
        </div>

        {scenarioActive && (
          <div className="text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-2">cenário ativo</Badge>
            O plano está simulando <strong>+{growthPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.m.</strong> em vez
            da base cadastrada. Isso não altera as metas — apenas esta simulação (compartilhada com a aba Metas).
          </div>
        )}

        {plan.loading ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Carregando plano...</CardContent></Card>
        ) : (
          <>
            <PlanMrrBridge
              rows={rows}
              loading={plan.loading}
              canEdit={canEdit}
              onSave={plan.saveOverride}
            />

            <QuotasPanel
              sellers={plan.sellers}
              historyByMonth={sellerHistory.byMonth}
              rows={rows}
              savedQuotas={plan.quotaRows}
              currentMonth={currentMonth}
              canEdit={canEdit}
              onOpenMonth={plan.loadQuotas}
              onSave={plan.saveQuotas}
            />

            <PipelineCoverage
              funnels={funnel.funnels}
              funnelId={funnelId}
              onFunnelChange={setFunnelId}
              kpis={funnel.kpis}
              openPipeline={funnel.openPipeline}
              rows={rows}
              currentMonth={currentMonth}
              loading={funnel.loading}
              hasFunnelData={funnel.hasFunnelData}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
