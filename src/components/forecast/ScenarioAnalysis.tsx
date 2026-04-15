import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle2, Lightbulb, Users, PhoneCall, Target,
} from "lucide-react";
import { SAAS_BENCHMARKS, FUNNEL_TRANSITIONS } from "@/lib/constants";

interface ScenarioAnalysisProps {
  actualRates: Record<string, number | null>;
  stageCounts: Record<string, number>;
  sellerCount: number;
}

interface Recommendation {
  severity: "critical" | "warning" | "opportunity";
  icon: React.ElementType;
  title: string;
  description: string;
}

const CAPACITY_DEFAULTS = {
  mqls_per_sdr: 150,
  calls_per_closer: 40,
  meetings_per_seller: 20,
};

export function ScenarioAnalysis({ actualRates, stageCounts, sellerCount }: ScenarioAnalysisProps) {
  const recommendations: Recommendation[] = [];

  // Analyze each transition
  FUNNEL_TRANSITIONS.forEach((t) => {
    const benchmark = SAAS_BENCHMARKS[t.benchmarkKey];
    const actual = actualRates[t.key];
    if (actual === null) return;

    const ratio = actual / benchmark;

    if (ratio < 0.5) {
      // Critical: way below benchmark
      const rec = getRecommendation(t.key, "critical");
      if (rec) recommendations.push(rec);
    } else if (ratio < 0.8) {
      // Warning: below benchmark
      const rec = getRecommendation(t.key, "warning");
      if (rec) recommendations.push(rec);
    }
  });

  // Check capacity
  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const leadsPerSeller = sellerCount > 0 ? totalLeads / sellerCount : totalLeads;

  if (leadsPerSeller > CAPACITY_DEFAULTS.mqls_per_sdr) {
    recommendations.push({
      severity: "critical",
      icon: Users,
      title: "Capacidade de SDR no limite",
      description: `Cada vendedor está gerenciando ~${Math.round(leadsPerSeller)} leads. O ideal é até ${CAPACITY_DEFAULTS.mqls_per_sdr}. Considere contratar mais um SDR.`,
    });
  } else if (leadsPerSeller < CAPACITY_DEFAULTS.mqls_per_sdr * 0.5) {
    recommendations.push({
      severity: "opportunity",
      icon: Lightbulb,
      title: "Capacidade ociosa — oportunidade",
      description: `Vendedores gerenciam ~${Math.round(leadsPerSeller)} leads cada. Há espaço para aumentar o volume de leads sem precisar contratar.`,
    });
  }

  // If no issues found
  if (recommendations.length === 0) {
    recommendations.push({
      severity: "opportunity",
      icon: CheckCircle2,
      title: "Funil saudável",
      description: "As taxas de conversão estão alinhadas com os benchmarks de mercado. Continue monitorando.",
    });
  }

  // Sort by severity
  const order = { critical: 0, warning: 1, opportunity: 2 };
  recommendations.sort((a, b) => order[a.severity] - order[b.severity]);

  // Capacity bars
  const capacityBars = [
    {
      label: "SDR — MQLs/pessoa",
      current: Math.round(leadsPerSeller),
      max: CAPACITY_DEFAULTS.mqls_per_sdr,
    },
    {
      label: "Closer — Calls/mês",
      current: stageCounts.proposta_enviada ?? 0,
      max: CAPACITY_DEFAULTS.calls_per_closer * Math.max(1, sellerCount),
    },
    {
      label: "Reuniões/mês",
      current: stageCounts.diagnostico ?? 0,
      max: CAPACITY_DEFAULTS.meetings_per_seller * Math.max(1, sellerCount),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Análise de Cenário & Recomendações</CardTitle>
        <CardDescription>
          Gargalos identificados e sugestões baseadas nos seus dados vs. benchmarks SaaS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Capacity utilization */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Aproveitamento de Capacidade
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {capacityBars.map((bar) => {
              const pct = bar.max > 0 ? Math.min(100, (bar.current / bar.max) * 100) : 0;
              return (
                <div key={bar.label} className="space-y-2 p-3 rounded-lg border">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{bar.label}</span>
                    <span className="text-muted-foreground">
                      {bar.current}/{bar.max}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className={`h-2 ${pct > 90 ? "[&>div]:bg-red-500" : pct > 70 ? "[&>div]:bg-yellow-500" : ""}`}
                  />
                  <p className="text-xs text-muted-foreground">{pct.toFixed(0)}% utilizado</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommendations */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recomendações
          </h4>
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  rec.severity === "critical"
                    ? "border-red-500/30 bg-red-500/5"
                    : rec.severity === "warning"
                    ? "border-yellow-500/30 bg-yellow-500/5"
                    : "border-green-500/30 bg-green-500/5"
                }`}
              >
                <rec.icon
                  className={`h-5 w-5 mt-0.5 shrink-0 ${
                    rec.severity === "critical"
                      ? "text-red-500"
                      : rec.severity === "warning"
                      ? "text-yellow-500"
                      : "text-green-500"
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{rec.title}</span>
                    <Badge
                      variant="secondary"
                      className={
                        rec.severity === "critical"
                          ? "bg-red-500/10 text-red-600"
                          : rec.severity === "warning"
                          ? "bg-yellow-500/10 text-yellow-600"
                          : "bg-green-500/10 text-green-600"
                      }
                    >
                      {rec.severity === "critical" ? "Crítico" : rec.severity === "warning" ? "Atenção" : "Oportunidade"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getRecommendation(key: string, severity: "critical" | "warning"): Recommendation | null {
  const map: Record<string, { title: string; description: string; icon: React.ElementType }> = {
    prospeccao_resposta: {
      title: "Taxa de resposta baixa",
      description:
        severity === "critical"
          ? "A taxa de resposta está muito abaixo do benchmark. Revise a cadência de prospecção, melhore a qualificação dos leads ou invista em aquisição de leads de topo de funil mais qualificados."
          : "A taxa de resposta pode melhorar. Teste novos canais de aquisição ou refine o ICP (perfil de cliente ideal).",
      icon: AlertTriangle,
    },
    resposta_agendamento: {
      title: "Agendamento está abaixo do esperado",
      description:
        severity === "critical"
          ? "Poucos contatos estão virando reuniões. Melhore o script de abordagem, treine SDRs ou contrate mais um SDR para aumentar o volume."
          : "A conversão para agendamento pode ser otimizada. Revise o pitch inicial e teste abordagens diferentes.",
      icon: PhoneCall,
    },
    agendamento_comparecimento: {
      title: "Comparecimento em reuniões baixo",
      description:
        severity === "critical"
          ? "Muitas reuniões agendadas não estão acontecendo. Implemente confirmações automáticas por WhatsApp/email 24h antes e lembretes no dia."
          : "Melhore o comparecimento com lembretes automáticos e confirmação de presença antes da reunião.",
      icon: Target,
    },
    comparecimento_conversao: {
      title: "Conversão final está baixa",
      description:
        severity === "critical"
          ? "A taxa de fechamento está crítica. Revise a proposta comercial, treine closers em técnicas de negociação e analise os motivos de perda."
          : "A conversão pode melhorar. Analise os deals perdidos para identificar objeções recorrentes e ajuste a proposta.",
      icon: Target,
    },
  };

  const entry = map[key];
  return entry ? { severity, ...entry } : null;
}
