import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Target, TrendingUp, Users } from "lucide-react";
import { SAAS_BENCHMARKS } from "@/lib/constants";

interface GapToGoalProps {
  targetDeals: number;
  targetMrr: number;
  currentWon: number;
  currentMrr: number;
  actualRates: Record<string, number | null>;
  stageCounts: Record<string, number>;
}

export function GapToGoal({
  targetDeals,
  targetMrr,
  currentWon,
  currentMrr,
  actualRates,
  stageCounts,
}: GapToGoalProps) {
  // Use actual rates when available, fallback to benchmarks
  const rConversao = actualRates.comparecimento_conversao ?? SAAS_BENCHMARKS.comparecimento_conversao;
  const rComparecimento = actualRates.agendamento_comparecimento ?? SAAS_BENCHMARKS.agendamento_comparecimento;
  const rAgendamento = actualRates.resposta_agendamento ?? SAAS_BENCHMARKS.resposta_agendamento;
  const rResposta = actualRates.prospeccao_resposta ?? SAAS_BENCHMARKS.prospeccao_resposta;

  // Reverse calculation from target deals
  const dealsNeeded = Math.max(0, targetDeals - currentWon);
  const comparecimentosNeeded = Math.ceil(dealsNeeded / rConversao);
  const agendamentosNeeded = Math.ceil(comparecimentosNeeded / rComparecimento);
  const respostasNeeded = Math.ceil(agendamentosNeeded / rAgendamento);
  const prospeccaoNeeded = Math.ceil(respostasNeeded / rResposta);

  // Current counts from stages
  const currentProspeccao = stageCounts.novo_lead ?? 0;
  const currentRespostas = stageCounts.contato_realizado ?? 0;
  const currentAgendamentos = stageCounts.diagnostico ?? 0;
  const currentComparecimentos = (stageCounts.proposta_enviada ?? 0) + (stageCounts.negociacao ?? 0);

  const steps = [
    {
      label: "Leads Topo de Funil",
      icon: Users,
      current: currentProspeccao,
      needed: prospeccaoNeeded,
      color: "bg-blue-500",
    },
    {
      label: "Respostas / Contatos",
      icon: TrendingUp,
      current: currentRespostas,
      needed: respostasNeeded,
      color: "bg-cyan-500",
    },
    {
      label: "Reuniões Agendadas",
      icon: Target,
      current: currentAgendamentos,
      needed: agendamentosNeeded,
      color: "bg-violet-500",
    },
    {
      label: "Propostas / Negociações",
      icon: ArrowRight,
      current: currentComparecimentos,
      needed: comparecimentosNeeded,
      color: "bg-amber-500",
    },
    {
      label: "Deals Fechados",
      icon: Target,
      current: currentWon,
      needed: targetDeals,
      color: "bg-green-500",
    },
  ];

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
        {/* MRR progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Meta MRR</span>
            <span>
              R$ {currentMrr.toLocaleString("pt-BR")} / R$ {targetMrr.toLocaleString("pt-BR")}
            </span>
          </div>
          <Progress value={mrrProgress} className="h-3" />
        </div>

        {/* Funnel steps */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {steps.map((step, i) => {
            const pct = step.needed > 0 ? Math.min(100, (step.current / step.needed) * 100) : 0;
            const gap = Math.max(0, step.needed - step.current);
            return (
              <div key={step.label} className="relative p-4 rounded-lg border bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <step.icon className="h-4 w-4 text-muted-foreground" />
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
                {gap === 0 && step.current >= step.needed && (
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
