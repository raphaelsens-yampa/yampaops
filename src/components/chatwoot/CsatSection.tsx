import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Smile } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, LabelList,
} from "recharts";

type CsatRow = {
  chatwoot_conversation_id: number;
  rating: number | null;
  feedback_message: string | null;
  contact_name: string | null;
  assignee_name: string | null;
  team_name: string | null;
  responded_at: string | null;
};

const RATING_LABEL: Record<number, string> = {
  1: "Muito insatisfeito",
  2: "Insatisfeito",
  3: "Neutro",
  4: "Satisfeito",
  5: "Muito satisfeito",
};

function fmtDateTimeBR(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function CsatSection({
  from, to, agent, team,
}: { from: string; to: string; agent: string; team: string }) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<CsatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("chatwoot_csat_responses")
      .select("chatwoot_conversation_id, rating, feedback_message, contact_name, assignee_name, team_name, responded_at")
      .gte("responded_at", `${from}T00:00:00-03:00`)
      .lte("responded_at", `${to}T23:59:59-03:00`)
      .order("responded_at", { ascending: false })
      .limit(5000);
    if (error) toast({ title: "Erro ao carregar CSAT", description: error.message, variant: "destructive" });
    setRows((data || []) as CsatRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  async function sync() {
    setSyncing(true);
    try {
      let page = 1;
      let total = 0;
      // Sincroniza em blocos até esgotar as páginas do Chatwoot (limite de segurança).
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabase.functions.invoke("chatwoot-csat-sync", {
          body: { page_start: page, max_pages: 10 },
        });
        if (error) throw error;
        const d = data as { ok?: boolean; error?: string; upserted?: number; last_page?: number; done?: boolean };
        if (d?.error) throw new Error(d.error);
        total += d?.upserted || 0;
        page = (d?.last_page || page) + 1;
        if (d?.done) break;
      }
      toast({ title: "CSAT sincronizado", description: `${total} respostas atualizadas.` });
      await load();
    } catch (e) {
      toast({
        title: "Falha ao sincronizar CSAT",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (agent !== "all" && (r.assignee_name || "—") !== agent) return false;
    if (team !== "all" && (r.team_name || "—") !== team) return false;
    return true;
  }), [rows, agent, team]);

  const kpis = useMemo(() => {
    const rated = filtered.filter((r) => r.rating != null) as (CsatRow & { rating: number })[];
    const total = rated.length;
    const sum = rated.reduce((a, r) => a + r.rating, 0);
    const positives = rated.filter((r) => r.rating >= 4).length;
    const negatives = rated.filter((r) => r.rating <= 2).length;
    return {
      total,
      avg: total ? sum / total : 0,
      score: total ? (positives / total) * 100 : 0,
      positives,
      negatives,
      withComment: filtered.filter((r) => (r.feedback_message || "").trim().length > 0).length,
    };
  }, [filtered]);

  const distribution = useMemo(() => {
    return [1, 2, 3, 4, 5].map((n) => ({
      name: `${n} — ${RATING_LABEL[n]}`,
      rating: n,
      total: filtered.filter((r) => r.rating === n).length,
    }));
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; respostas: number; sum: number }>();
    filtered.forEach((r) => {
      if (!r.responded_at || r.rating == null) return;
      const d = new Date(r.responded_at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const cur = map.get(d) || { date: d, respostas: 0, sum: 0 };
      cur.respostas++;
      cur.sum += r.rating;
      map.set(d, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((v) => ({ date: v.date, respostas: v.respostas, media: Number((v.sum / v.respostas).toFixed(2)) }));
  }, [filtered]);

  function ranking(key: "assignee_name" | "team_name") {
    const map = new Map<string, { name: string; total: number; sum: number; pos: number; neg: number }>();
    filtered.forEach((r) => {
      if (r.rating == null) return;
      const name = r[key] || "—";
      const cur = map.get(name) || { name, total: 0, sum: 0, pos: 0, neg: 0 };
      cur.total++;
      cur.sum += r.rating;
      if (r.rating >= 4) cur.pos++;
      if (r.rating <= 2) cur.neg++;
      map.set(name, cur);
    });
    return Array.from(map.values())
      .map((v) => ({ ...v, avg: v.sum / v.total, score: (v.pos / v.total) * 100 }))
      .sort((a, b) => b.score - a.score || b.total - a.total);
  }

  const byAgent = useMemo(() => ranking("assignee_name"), [filtered]);
  const byTeam = useMemo(() => ranking("team_name"), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Smile className="h-5 w-5 text-primary" />
          CSAT (Satisfação do Cliente)
        </h2>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Sincronizar CSAT
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <CsatKpi title="Respostas" value={String(kpis.total)} />
        <CsatKpi title="CSAT Score" value={`${kpis.score.toFixed(1)}%`} />
        <CsatKpi title="Nota média" value={kpis.total ? kpis.avg.toFixed(2) : "—"} />
        <CsatKpi title="Positivas (4-5)" value={String(kpis.positives)} />
        <CsatKpi title="Negativas (1-2)" value={String(kpis.negatives)} />
        <CsatKpi title="Com comentário" value={String(kpis.withComment)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Distribuição das notas</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="rating" type="category" width={30} />
                <Tooltip formatter={(v: number, _n, p: any) => [v, p?.payload?.name]} />
                <Bar dataKey="total" name="Respostas" fill="hsl(var(--primary))">
                  <LabelList dataKey="total" position="right" style={{ fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Evolução diária</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 5]} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="respostas" name="Respostas" stroke="hsl(var(--primary))" />
                <Line yAxisId="right" type="monotone" dataKey="media" name="Nota média" stroke="hsl(var(--secondary))" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingTable title="Ranking por Agente" rows={byAgent} label="Agente" />
        <RankingTable title="Ranking por Time" rows={byTeam} label="Time" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Respostas e comentários</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Nota</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Agente</TableHead>
                  <TableHead className="text-xs">Comentário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((r) => (
                  <TableRow key={r.chatwoot_conversation_id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDateTimeBR(r.responded_at)}</TableCell>
                    <TableCell>
                      <Badge variant={r.rating != null && r.rating >= 4 ? "default" : r.rating != null && r.rating <= 2 ? "destructive" : "secondary"}>
                        {r.rating ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.contact_name || "—"}</TableCell>
                    <TableCell className="text-xs">{r.assignee_name || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[420px]">{(r.feedback_message || "").trim() || "—"}</TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nenhuma resposta de CSAT no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CsatKpi({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RankingTable({
  title, rows, label,
}: {
  title: string;
  label: string;
  rows: { name: string; total: number; avg: number; score: number; neg: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[320px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{label}</TableHead>
                <TableHead className="text-right text-xs">Respostas</TableHead>
                <TableHead className="text-right text-xs">Média</TableHead>
                <TableHead className="text-right text-xs">Score</TableHead>
                <TableHead className="text-right text-xs">Negativas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="text-xs">{r.name}</TableCell>
                  <TableCell className="text-right text-xs">{r.total}</TableCell>
                  <TableCell className="text-right text-xs">{r.avg.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs">{r.score.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-xs">{r.neg}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    Sem dados no período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
