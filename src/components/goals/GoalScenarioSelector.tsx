import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { useGoalScenario } from "@/hooks/useGoalScenario";
import { BASELINE_GROWTH_PCT, SCENARIO_PRESETS, scenarioLabel } from "@/lib/goalScenario";

const CUSTOM = "custom";

/**
 * Seletor de cenário de crescimento (simulação local). Eleva todas as metas
 * na hora, sem alterar o cadastro.
 */
export function GoalScenarioSelector({ className }: { className?: string }) {
  const { growthPct, setScenario } = useGoalScenario();
  const isPreset = SCENARIO_PRESETS.includes(growthPct as (typeof SCENARIO_PRESETS)[number]);
  const [custom, setCustom] = useState(isPreset ? "" : String(growthPct || ""));
  const mode = isPreset ? String(growthPct) : CUSTOM;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mode}
          onValueChange={(v) => {
            if (v === CUSTOM) {
              const n = Number(custom.replace(",", "."));
              setScenario(isFinite(n) ? n : 0);
            } else {
              setCustom("");
              setScenario(Number(v));
            }
          }}
        >
          <SelectTrigger className="h-10 md:h-9 w-full md:w-56" aria-label="Cenário de crescimento">
            <TrendingUp className="h-4 w-4 mr-1 shrink-0" />
            <SelectValue placeholder="Cenário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Cadastrado ({BASELINE_GROWTH_PCT}% a.m.)</SelectItem>
            <SelectItem value="5">Cenário 5% a.m.</SelectItem>
            <SelectItem value="10">Cenário 10% a.m.</SelectItem>
            <SelectItem value={CUSTOM}>Personalizado…</SelectItem>
          </SelectContent>
        </Select>
        {mode === CUSTOM && (
          <div className="flex items-center gap-1">
            <Input
              className="h-10 md:h-9 w-24"
              inputMode="decimal"
              placeholder="% a.m."
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                const n = Number(e.target.value.replace(",", "."));
                setScenario(isFinite(n) ? n : 0);
              }}
            />
            <span className="text-xs text-muted-foreground">% a.m.</span>
          </div>
        )}
        {growthPct > 0 && (
          <Badge variant="secondary" className="whitespace-nowrap">
            {scenarioLabel(growthPct)} · simulação
          </Badge>
        )}
      </div>
      {growthPct > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Metas elevadas por crescimento composto de MRR; metas de churn/downsell ficam{" "}
          {growthPct.toString().replace(".", ",")}% mais rígidas. Realizados e cadastro não mudam.
        </p>
      )}
    </div>
  );
}
