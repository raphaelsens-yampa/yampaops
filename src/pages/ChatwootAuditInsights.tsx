import { useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from "recharts";
import { format, subDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ChatwootAuditInsights() {
  const { role } = useAuth();
  if (role !== "admin" && role !== "tatico") return <Navigate to="/atendimentos/auditoria" replace />;

  const since = subDays(new Date(), 84).toISOString();

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ["audit-insights", since],
    queryFn: async () => {
      const { data, error } = await supabase.from("chatwoot_conversation_audits")
        .select("assignee_email, assignee_name, severity, human_severity, overall_score, human_overall_score, playbook_checks, churn_signals, inbox_name, conversation_resolved_at")
        .gte("conversation_resolved_at", since)
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
  });

  const eff = (a: any) => ({ score: Number(a.human_overall_score ?? a.overall_score) || 0, sev: a.human_severity || a.severity });

  // Linha temporal: score médio semanal (geral)
  const weekly = useMemo(() => {
    const m = new Map<string, { sum: number; n: number; ok: number; attn: number; crit: number }>();
    for (const a of audits) {
      if (!a.conversation_resolved_at) continue;
      const wk = format(startOfWeek(new Date(a.conversation_resolved_at), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const cur = m.get(wk) || { sum: 0, n: 0, ok: 0, attn: 0, crit: 0 };
      const e = eff(a);
      cur.sum += e.score; cur.n++;
      if (e.sev === "ok") cur.ok++;
      else if (e.sev === "attention") cur.attn++;
      else if (e.sev === "critical") cur.crit++;
      m.set(wk, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([wk, v]) => ({
      week: format(new Date(wk), "dd/MM", { locale: ptBR }),
      score: Math.round(v.sum / Math.max(1, v.n)),
      ok: v.ok, attention: v.attn, critical: v.crit,
    }));
  }, [audits]);

  // Heatmap playbook por atendente — mostramos como tabela tradicional
  const playbookHeatmap = useMemo(() => {
    const sellers = new Map<string, Map<string, { pass: number; total: number }>>();
    for (const a of audits) {
      const key = a.assignee_name || a.assignee_email || "—";
      const inner = sellers.get(key) || new Map();
      for (const c of (a.playbook_checks || [])) {
        const cur = inner.get(c.key) || { pass: 0, total: 0 };
        cur.total++;
        if (c.passed) cur.pass++;
        inner.set(c.key, cur);
      }
      sellers.set(key, inner);
    }
    const allKeys = new Set<string>();
    sellers.forEach((m) => m.forEach((_, k) => allKeys.add(k)));
    return { sellers, keys: Array.from(allKeys) };
  }, [audits]);

  const churnByInbox = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of audits) {
      if ((a.churn_signals?.length || 0) === 0) continue;
      const k = a.inbox_name || "—";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [audits]);

  return (
    <Layout>
      <div className="space-y-5 p-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/atendimentos/auditoria"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
          <h1 className="text-2xl font-heading font-bold">Insights & Tendências</h1>
          <p className="text-sm text-muted-foreground">Últimas 12 semanas. Usa nota humana quando disponível.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Score médio semanal</CardTitle></CardHeader>
              <CardContent style={{ height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Funil de severidade por semana</CardTitle></CardHeader>
              <CardContent style={{ height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ok" stackId="a" fill="hsl(var(--success))" />
                    <Bar dataKey="attention" stackId="a" fill="hsl(var(--warning))" />
                    <Bar dataKey="critical" stackId="a" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Heatmap do Playbook (% de pass por atendente)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2">Atendente</th>
                      {playbookHeatmap.keys.map((k) => <th key={k} className="p-2">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(playbookHeatmap.sellers.entries()).map(([seller, items]) => (
                      <tr key={seller}>
                        <td className="p-2 font-medium">{seller}</td>
                        {playbookHeatmap.keys.map((k) => {
                          const v = items.get(k);
                          if (!v) return <td key={k} className="p-2 text-muted-foreground">—</td>;
                          const pct = (v.pass / v.total) * 100;
                          const bg = pct >= 80 ? "bg-success/30" : pct >= 50 ? "bg-warning/30" : "bg-destructive/30";
                          return <td key={k} className={`p-2 text-center tabular-nums ${bg}`}>{pct.toFixed(0)}%</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Sinais de churn por inbox</CardTitle></CardHeader>
              <CardContent style={{ height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={churnByInbox}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--warning))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
