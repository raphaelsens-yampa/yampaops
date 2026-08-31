import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { useGoalScenario } from "@/hooks/useGoalScenario";
import { useGrowthBaselines } from "@/hooks/useGrowthBaselines";
import { BASELINE_GROWTH_PCT, SCENARIO_PRESETS, makeGrowthRate, scenarioLabel } from "@/lib/goalScenario";

const CUSTOM = "custom";
const MAX_PCT = 100;

function isPresetPct(pct: number) {
  return SCENARIO_PRESETS.includes(pct as (typeof SCENARIO_PRESETS)[number]);
}

/** Converte texto digitado em % válido (0 = sem cenário). */
function parsePct(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_PCT);
}

/**
 * Seletor de cenário de crescimento (simulação local). Eleva todas as metas
 * na hora, sem alterar o cadastro.
 */
export function GoalScenarioSelector({ className }: { className?: string }) {
  const { growthPct, setScenario } = useGoalScenario();
  // Modo é estado próprio: "Personalizado…" continua selecionado mesmo com o campo vazio.
  const [customMode, setCustomMode] = useState(() => growthPct > 0 && !isPresetPct(growthPct));
  const [custom, setCustom] = useState(() =>
    growthPct > 0 && !isPresetPct(growthPct) ? String(growthPct).replace(".", ",") : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const { baselines } = useGrowthBaselines();
  /** Base oficial vigente no mês atual (cadastro no banco; 1% a.m. por padrão). */
  const basePct = useMemo(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rate = makeGrowthRate(0, baselines)(month) * 100;
    return rate > 0 ? rate : BASELINE_GROWTH_PCT;
  }, [baselines]);
  const baseLabel = basePct.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  useEffect(() => {
    if (customMode) inputRef.current?.focus();
  }, [customMode]);

  const mode = customMode ? CUSTOM : String(isPresetPct(growthPct) ? growthPct : 0);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mode}
          onValueChange={(v) => {
            if (v === CUSTOM) {
              setCustomMode(true);
              const pct = parsePct(custom);
              if (pct) setScenario(pct);
              return;
            }
            setCustomMode(false);
            setCustom("");
            setScenario(Number(v));
          }}
        >
          <SelectTrigger className="h-10 md:h-9 w-full md:w-56" aria-label="Cenário de crescimento">
            <TrendingUp className="h-4 w-4 mr-1 shrink-0" />
            <SelectValue placeholder="Cenário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Cadastrado ({baseLabel}% a.m.)</SelectItem>
            <SelectItem value="5">Cenário 5% a.m.</SelectItem>
            <SelectItem value="10">Cenário 10% a.m.</SelectItem>
            <SelectItem value={CUSTOM}>Personalizado…</SelectItem>
          </SelectContent>
        </Select>
        {customMode && (
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              className="h-10 md:h-9 w-24"
              inputMode="decimal"
              placeholder="% a.m."
              aria-label="Crescimento personalizado por mês"
              value={custom}
              onChange={(e) => {
                const raw = e.target.value;
                setCustom(raw);
                setScenario(parsePct(raw));
              }}
            />
            <span className="text-xs text-muted-foreground">% a.m.</span>
          </div>
        )}
        {growthPct > 0 ? (
          <Badge variant="secondary" className="whitespace-nowrap">
            {scenarioLabel(growthPct, basePct)} · simulação
          </Badge>
        ) : (
          <Badge variant="outline" className="whitespace-nowrap">
            Base oficial {baseLabel}% a.m.
          </Badge>
        )}
      </div>
      {customMode && growthPct <= 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Digite o crescimento mensal desejado (ex.: 7,5). Até {MAX_PCT}% a.m.
        </p>
      )}
      {growthPct > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Metas elevadas por crescimento composto de MRR; metas de churn/downsell ficam{" "}
          {growthPct.toString().replace(".", ",")}% mais rígidas. Realizados e cadastro não mudam.
        </p>
      )}

    </div>
  );
}
