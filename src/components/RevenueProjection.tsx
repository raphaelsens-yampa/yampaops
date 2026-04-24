import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { STAGE_WEIGHTS } from "@/lib/constants";

interface Props {
  leads: any[];
}

export function RevenueProjection({ leads }: Props) {
  const activeLeads = leads.filter(l => !l.converted_at && !["fechado_won", "perdido", "ganho"].includes(l.stage));
  const wonLeads = leads.filter(l => l.converted_at || l.stage === "fechado_won" || l.stage === "ganho");

  // Group by month (converted_at) for projection
  const months: Record<string, { mrr_closed: number; arpa_closed: number; mrr_projected: number; arpa_projected: number }> = {};

  const getMonthKey = (d: string) => {
    const date = new Date(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  const getLabel = (key: string) => {
    const [y, m] = key.split("-");
    const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${names[parseInt(m) - 1]}/${y.slice(2)}`;
  };

  // Current and next 2 months
  const now = new Date();
  for (let i = -2; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months[key] = { mrr_closed: 0, arpa_closed: 0, mrr_projected: 0, arpa_projected: 0 };
  }

  wonLeads.forEach(l => {
    const dateRef = l.converted_at || l.updated_at;
    if (!dateRef) return;
    const key = getMonthKey(dateRef);
    if (months[key]) {
      months[key].mrr_closed += l.estimated_mrr || 0;
      months[key].arpa_closed += (l.estimated_tpv || 0) * (l.take_rate || 0) / 100;
    }
  });

  // Distribute weighted pipeline into current month as projection
  const currentKey = getMonthKey(now.toISOString());
  activeLeads.forEach(l => {
    const weight = STAGE_WEIGHTS[l.stage] || 0;
    if (months[currentKey]) {
      months[currentKey].mrr_projected += (l.estimated_mrr || 0) * weight;
      months[currentKey].arpa_projected += (l.estimated_tpv || 0) * (l.take_rate || 0) / 100 * weight;
    }
  });

  const data = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      name: getLabel(key),
      "MRR Fechado": Math.round(v.mrr_closed),
      "MRR Projetado": Math.round(v.mrr_projected),
      "Receita ARPA": Math.round(v.arpa_closed + v.arpa_projected),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Projeção de Receita (MRR + ARPA × Take Rate)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
            <Legend />
            <Bar dataKey="MRR Fechado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} stackId="mrr" />
            <Bar dataKey="MRR Projetado" fill="hsl(var(--primary) / 0.4)" radius={[4, 4, 0, 0]} stackId="mrr" />
            <Bar dataKey="Receita ARPA" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
