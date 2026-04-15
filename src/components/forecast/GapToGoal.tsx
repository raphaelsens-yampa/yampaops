import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Target } from "lucide-react";
import type { DynamicTransition } from "@/pages/Forecast";

interface GapToGoalProps {
  targetDeals: number;
  targetMrr: number;
  currentWon: number;
  currentMrr: number;
  actualRates: Record<string, number | null>;
  stageCounts: Record<string, number>;
  transitions: DynamicTransition[];
  stageLabels: Record<string, string>;
  wonSlug?: string;
}

const DEFAULT_RATE = 0.25;

export function GapToGoal({
  targetDeals, targetMrr, currentWon, currentMrr,
  actualRates, stageCounts, transitions, stageLabels, wonSlug,
}: GapToGoalProps) {
  // Reverse calculation: from deals needed, work backwards through transitions
  const dealsNeeded = Math.max(0, targetDeals - currentWon);

  // Build steps from transitions in reverse
  // transitions[last] is "lastActive → won", transitions[0] is "first → second"
  // We need: for each stage, how many are needed
  const safeTransitions = transitions ?? [];
  const reversedTransitions = [...safeTransitions].reverse();

  const stageNeeded: Record<string, number> = {};
  if (wonSlug) stageNeeded[wonSlug] = targetDeals;

  let currentNeeded = dealsNeeded;
  for (const t of reversedTransitions) {
    const rate = actualRates[t.key] ?? DEFAULT_RATE;
    const safeRate = Math.max(rate, 0.01);
    currentNeeded = Math.ceil(currentNeeded / safeRate);
    stageNeeded[t.fromSlug] = currentNeeded;
  }

  // Build display steps: all unique stages from transitions + won
  const stageSequence: string[] = [];
  if (safeTransitions.length > 0) {
    stageSequence.push(safeTransitions[0].fromSlug);
    for (const t of safeTransitions) {
      stageSequence.push(t.toSlug);
    }
  }

  const steps = stageSequence.map((slug) => ({
    label: stageLabels[slug] || slug,
    slug,
    current: stageCounts[slug] ?? 0,
    needed: stageNeeded[slug] ?? 0,
  }));

  const mrrProgress = targetMrr > 0 ? Math.min(100, (currentMrr / targetMrr) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Quanto Você Precisa para Bater a Meta</CardTitle>
        <CardDescription>
          Cálculo reverso: da meta de {targetDeals} deals, quanto precisa em cada etapa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Meta MRR</span>
            <span>
              R$ {currentMrr.toLocaleString("pt-BR")} / R$ {targetMrr.toLocaleString("pt-BR")}
            </span>
          </div>
          <Progress value={mrrProgress} className="h-3" />
        </div>

        <div className={`grid grid-cols-1 gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(steps.length, 6)}, minmax(0, 1fr))` }}>
          {steps.map((step, i) => {
            const pct = step.needed > 0 ? Math.min(100, (step.current / step.needed) * 100) : 0;
            const gap = Math.max(0, step.needed - step.current);
            return (
              <div key={step.slug} className="relative p-4 rounded-lg border bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium truncate">{step.label}</span>
                </div>
                <div className="text-2xl font-heading font-bold">
                  {step.current}
                  <span className="text-sm font-normal text-muted-foreground"> / {step.needed}</span>
                </div>
                <Progress value={pct} className="h-2" />
                {gap > 0 && (
                  <p className="text-xs text-red-500 font-medium">Faltam {gap}</p>
                )}
                {gap === 0 && step.current >= step.needed && step.needed > 0 && (
                  <p className="text-xs text-green-500 font-medium">✓ Atingido</p>
                )}
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
