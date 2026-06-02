import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from "recharts";
import { format, subDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "14", label: "Últimos 14 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "60", label: "Últimos 60 dias" },
  { value: "84", label: "Últimas 12 semanas" },
];

export default function ChatwootAuditInsights() {
  const { role } = useAuth();
  const [days, setDays] = useState<string>("14");
  const [rowLimit, setRowLimit] = useState<string>("1000");

  if (role !== "admin" && role !== "tatico") return <Navigate to="/atendimentos/auditoria" replace />;

  const since = useMemo(() => subDays(new Date(), Number(days)).toISOString(), [days]);
  const limit = Number(rowLimit);

  const { data: audits = [], isLoading, isFetching } = useQuery({
    queryKey: ["audit-insights", since, limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("chatwoot_conversation_audits")
        .select("assignee_email, assignee_name, severity, human_severity, overall_score, human_overall_score, playbook_checks, churn_signals, inbox_name, conversation_resolved_at")
        .gte("conversation_resolved_at", since)
        .order("conversation_resolved_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const eff = (a: any) => ({ score: Number(a.human_overall_score ?? a.overall_score) || 0, sev: a.human_severity || a.severity });

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

  const playbookHeatmap = useMemo(() => {
    const sellers = new Map<string, Map<string, { pass: number; total: number }>>();
    for (const a of audits) {
      const key = a.assignee_name || a.assignee_email || "—";
      const inner = sellers.get(key) || new Map();
      for (const c of ((a.playbook_checks as any[]) || [])) {
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
      if (((a.churn_signals as any[])?.length || 0) === 0) continue;
      const k = a.inbox_name || "—";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [audits]);

  return (
    <Layout>
      <div className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/atendimentos/auditoria"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <h1 className="text-2xl font-heading font-bold">Insights & Tendências</h1>
            <p className="text-sm text-muted-foreground">
              {audits.length} auditorias analisadas. Usa nota humana quando disponível.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={rowLimit} onValueChange={setRowLimit}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="500">500 registros</SelectItem>
                <SelectItem value="1000">1000 registros</SelectItem>
                <SelectItem value="2500">2500 registros</SelectItem>
                <SelectItem value="5000">5000 registros</SelectItem>
              </SelectContent>
            </Select>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : audits.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhuma auditoria no período selecionado.</CardContent></Card>
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
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} isAnimationActive={false} />
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
                    <Bar dataKey="ok" stackId="a" fill="hsl(var(--success))" isAnimationActive={false} />
                    <Bar dataKey="attention" stackId="a" fill="hsl(var(--warning))" isAnimationActive={false} />
                    <Bar dataKey="critical" stackId="a" fill="hsl(var(--destructive))" isAnimationActive={false} />
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
                    <Bar dataKey="value" fill="hsl(var(--warning))" isAnimationActive={false} />
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
