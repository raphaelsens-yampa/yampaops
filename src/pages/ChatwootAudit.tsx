import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { CalendarIcon, RefreshCw, Settings, AlertTriangle, ShieldAlert, ShieldCheck, MessageSquareWarning, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";

type AuditRow = {
  id: string;
  conversation_id: number;
  analyzed_at: string;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_email: string | null;
  team_name: string | null;
  inbox_name: string | null;
  conversation_resolved_at: string | null;
  message_count: number;
  overall_score: number;
  severity: "ok" | "attention" | "critical";
  tone_score: number;
  tone_flags: any[];
  churn_risk_score: number;
  churn_signals: any[];
  playbook_score: number;
  playbook_checks: any[];
  competitor_mentions: any[];
  summary: string | null;
  review_status: "pending" | "confirmed" | "false_positive" | "dismissed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

const SEVERITY_META: Record<string, { label: string; cls: string; icon: any }> = {
  ok: { label: "OK", cls: "bg-success/15 text-success border-success/30", icon: ShieldCheck },
  attention: { label: "Atenção", cls: "bg-warning/15 text-warning border-warning/30", icon: AlertTriangle },
  critical: { label: "Crítico", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: ShieldAlert },
};

const REVIEW_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmado", cls: "bg-destructive/15 text-destructive" },
  false_positive: { label: "Falso positivo", cls: "bg-success/15 text-success" },
  dismissed: { label: "Descartado", cls: "bg-muted text-muted-foreground" },
};

function SeverityBadge({ sev }: { sev: string }) {
  const m = SEVERITY_META[sev] || SEVERITY_META.ok;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", m.cls)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const tone = v >= 70 ? "bg-success" : v >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{v.toFixed(0)}</span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className={cn("h-full transition-all", tone)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export default function ChatwootAudit() {
  const { role, canView } = useAuth();
  if (role !== "admin" && role !== "tatico" && !canView("auditoria_ia")) {
    return <Navigate to="/" replace />;
  }
  const isManager = role === "admin" || role === "tatico";
  const qc = useQueryClient();
  const { buildConversationUrl } = useChatwootIntegration();

  const [range, setRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [assignee, setAssignee] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [reviewStatus, setReviewStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const sinceISO = range?.from ? new Date(range.from.setHours(0, 0, 0, 0)).toISOString() : null;
  const beforeISO = range?.to ? new Date(range.to.setHours(23, 59, 59, 999)).toISOString() : null;

  const auditsQ = useQuery({
    queryKey: ["audits", sinceISO, beforeISO, assignee, severity, reviewStatus, search],
    queryFn: async () => {
      let q = supabase.from("chatwoot_conversation_audits").select("*").order("analyzed_at", { ascending: false }).limit(1000);
      if (sinceISO) q = q.gte("conversation_resolved_at", sinceISO);
      if (beforeISO) q = q.lte("conversation_resolved_at", beforeISO);
      if (assignee !== "all") q = q.eq("assignee_email", assignee);
      if (severity !== "all") q = q.eq("severity", severity);
      if (reviewStatus !== "all") q = q.eq("review_status", reviewStatus);
      if (search.trim()) q = q.or(`summary.ilike.%${search}%,assignee_name.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const audits = auditsQ.data || [];

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    audits.forEach((a) => {
      if (a.assignee_email) map.set(a.assignee_email, a.assignee_name || a.assignee_email);
    });
    return Array.from(map.entries());
  }, [audits]);

  const kpis = useMemo(() => {
    const total = audits.length;
    if (total === 0) return { total: 0, avg: 0, critical: 0, withTone: 0, withChurn: 0, playbook: 0 };
    const sum = (k: keyof AuditRow) => audits.reduce((s, a) => s + (Number(a[k] as any) || 0), 0);
    return {
      total,
      avg: sum("overall_score") / total,
      critical: audits.filter((a) => a.severity === "critical").length,
      withTone: audits.filter((a) => (a.tone_flags?.length || 0) > 0).length,
      withChurn: audits.filter((a) => (a.churn_signals?.length || 0) > 0 || (a.competitor_mentions?.length || 0) > 0).length,
      playbook: sum("playbook_score") / total,
    };
  }, [audits]);

  const ranking = useMemo(() => {
    const map = new Map<string, { name: string; email: string; count: number; sumOverall: number; sumTone: number; sumChurn: number; sumPlaybook: number; critical: number }>();
    audits.forEach((a) => {
      const key = a.assignee_email || a.assignee_name || "—";
      const cur = map.get(key) || { name: a.assignee_name || key, email: a.assignee_email || "", count: 0, sumOverall: 0, sumTone: 0, sumChurn: 0, sumPlaybook: 0, critical: 0 };
      cur.count++;
      cur.sumOverall += Number(a.overall_score) || 0;
      cur.sumTone += Number(a.tone_score) || 0;
      cur.sumChurn += Number(a.churn_risk_score) || 0;
      cur.sumPlaybook += Number(a.playbook_score) || 0;
      if (a.severity === "critical") cur.critical++;
      map.set(key, cur);
    });
    return Array.from(map.values())
      .map((r) => ({
        name: r.name,
        email: r.email,
        count: r.count,
        avgOverall: r.sumOverall / r.count,
        avgTone: r.sumTone / r.count,
        avgChurn: r.sumChurn / r.count,
        avgPlaybook: r.sumPlaybook / r.count,
        critical: r.critical,
        criticalPct: (r.critical / r.count) * 100,
      }))
      .sort((a, b) => b.avgOverall - a.avgOverall);
  }, [audits]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("chatwoot-audit-run", {
        body: { since: sinceISO, before: beforeISO, limit: 200, triggered_by: "manual" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Auditoria concluída: ${d?.analyzed || 0} analisados, ${d?.skipped || 0} já estavam atualizados.`);
      qc.invalidateQueries({ queryKey: ["audits"] });
    },
    onError: (e: any) => toast.error("Falha ao rodar auditoria: " + e.message),
  });

  const reanalyzeMutation = useMutation({
    mutationFn: async (convId: number) => {
      const { data, error } = await supabase.functions.invoke("chatwoot-audit-analyze-one", {
        body: { conversation_id: convId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Reanálise concluída.");
      qc.invalidateQueries({ queryKey: ["audits"] });
    },
    onError: (e: any) => toast.error("Falha na reanálise: " + e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await supabase
        .from("chatwoot_conversation_audits")
        .update({ review_status: status, review_notes: notes ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revisão registrada.");
      qc.invalidateQueries({ queryKey: ["audits"] });
      setSelected(null);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Auditoria Inteligente
            </h1>
            <p className="text-sm text-muted-foreground">Análise de qualidade dos atendimentos do Chatwoot por IA.</p>
          </div>
          {isManager && (
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/atendimentos/auditoria/configuracoes">
                  <Settings className="h-4 w-4 mr-2" /> Configurações
                </Link>
              </Button>
              <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
                {runMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Auditar período
              </Button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {range?.from ? format(range.from, "dd/MM/yy", { locale: ptBR }) : "início"} – {range?.to ? format(range.to, "dd/MM/yy", { locale: ptBR }) : "fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} locale={ptBR} />
              </PopoverContent>
            </Popover>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Atendente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos atendentes</SelectItem>
                {assignees.map(([email, name]) => (
                  <SelectItem key={email} value={email}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda severidade</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="attention">Atenção</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reviewStatus} onValueChange={setReviewStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda revisão</SelectItem>
                <SelectItem value="pending">Pendente revisão</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="false_positive">Falso positivo</SelectItem>
                <SelectItem value="dismissed">Descartado</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar resumo/atendente..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Auditadas", value: kpis.total },
            { label: "Score médio", value: kpis.avg.toFixed(0) },
            { label: "Críticas", value: kpis.critical, sub: kpis.total ? `${((kpis.critical / kpis.total) * 100).toFixed(0)}%` : "—" },
            { label: "Com flag de tom", value: kpis.withTone, sub: kpis.total ? `${((kpis.withTone / kpis.total) * 100).toFixed(0)}%` : "—" },
            { label: "Risco de churn", value: kpis.withChurn, sub: kpis.total ? `${((kpis.withChurn / kpis.total) * 100).toFixed(0)}%` : "—" },
            { label: "Playbook médio", value: `${kpis.playbook.toFixed(0)}%` },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-heading font-bold">{k.value}</p>
                {k.sub && <p className="text-[10px] text-muted-foreground">{k.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="ranking">
          <TabsList>
            <TabsTrigger value="ranking">Ranking por atendente</TabsTrigger>
            <TabsTrigger value="conversations">Conversas auditadas</TabsTrigger>
          </TabsList>

          <TabsContent value="ranking" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Qualidade por atendente</CardTitle></CardHeader>
              <CardContent>
                {ranking.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma auditoria no período. Clique em "Auditar período" para gerar.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Atendente</TableHead>
                        <TableHead className="text-right">Auditadas</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="text-right">Tom</TableHead>
                        <TableHead className="text-right">Risco churn</TableHead>
                        <TableHead className="text-right">Playbook</TableHead>
                        <TableHead className="text-right">Críticas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ranking.map((r) => (
                        <TableRow key={r.email || r.name}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{r.avgOverall.toFixed(0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.avgTone.toFixed(0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.avgChurn.toFixed(0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.avgPlaybook.toFixed(0)}%</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.critical > 0 && <Badge variant="outline" className="bg-destructive/10 text-destructive">{r.critical} ({r.criticalPct.toFixed(0)}%)</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversations">
            <Card>
              <CardHeader><CardTitle className="text-base">Conversas auditadas ({audits.length})</CardTitle></CardHeader>
              <CardContent>
                {auditsQ.isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : audits.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum atendimento auditado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severidade</TableHead>
                        <TableHead>Atendente</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Flags</TableHead>
                        <TableHead>Resumo</TableHead>
                        <TableHead>Revisão</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audits.slice(0, 200).map((a) => (
                        <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
                          <TableCell><SeverityBadge sev={a.severity} /></TableCell>
                          <TableCell className="text-sm">{a.assignee_name || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.conversation_resolved_at ? format(new Date(a.conversation_resolved_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{Number(a.overall_score).toFixed(0)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {(a.tone_flags?.length || 0) > 0 && <Badge variant="outline" className="bg-destructive/10 text-destructive text-[10px]"><MessageSquareWarning className="h-3 w-3 mr-1" />Tom</Badge>}
                              {(a.churn_signals?.length || 0) > 0 && <Badge variant="outline" className="bg-warning/10 text-warning text-[10px]">Churn</Badge>}
                              {(a.competitor_mentions?.length || 0) > 0 && <Badge variant="outline" className="bg-secondary/10 text-secondary text-[10px]">Concorrente</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{a.summary || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className={REVIEW_META[a.review_status]?.cls}>{REVIEW_META[a.review_status]?.label}</Badge></TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {buildConversationUrl(a.conversation_id) && (
                              <Button asChild size="icon" variant="ghost" title="Abrir no Chatwoot">
                                <a href={buildConversationUrl(a.conversation_id)!} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sheet de detalhe */}
        <AuditDetailSheet
          audit={selected}
          onClose={() => setSelected(null)}
          onReanalyze={(id) => reanalyzeMutation.mutate(id)}
          isReanalyzing={reanalyzeMutation.isPending}
          onReview={(payload) => reviewMutation.mutate(payload)}
          isReviewing={reviewMutation.isPending}
          isManager={isManager}
          chatwootUrl={selected ? buildConversationUrl(selected.conversation_id) : null}
        />
      </div>
    </Layout>
  );
}

function AuditDetailSheet({
  audit, onClose, onReanalyze, isReanalyzing, onReview, isReviewing, isManager, chatwootUrl,
}: {
  audit: AuditRow | null;
  onClose: () => void;
  onReanalyze: (id: number) => void;
  isReanalyzing: boolean;
  onReview: (p: { id: string; status: string; notes?: string }) => void;
  isReviewing: boolean;
  isManager: boolean;
  chatwootUrl: string | null;
}) {
  const [notes, setNotes] = useState("");

  return (
    <Sheet open={!!audit} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {audit && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="flex items-center gap-2">
                  <SeverityBadge sev={audit.severity} />
                  Conversa #{audit.conversation_id}
                </SheetTitle>
                <div className="flex gap-2">
                  {chatwootUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={chatwootUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" /> Abrir no Chatwoot
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onReanalyze(audit.conversation_id)} disabled={isReanalyzing}>
                    {isReanalyzing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Reanalisar
                  </Button>
                </div>
              </div>
              <SheetDescription>
                {audit.assignee_name} · {audit.team_name || "—"} · {audit.inbox_name || "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 mt-5">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Resumo da IA</p>
                    <Badge variant="outline">Score {Number(audit.overall_score).toFixed(0)}/100</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{audit.summary}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <ScoreBar value={audit.tone_score} label="Tom de voz" />
                  <ScoreBar value={100 - audit.churn_risk_score} label="Saúde do cliente (inverso do churn)" />
                  <ScoreBar value={audit.playbook_score} label="Aderência ao playbook" />
                </CardContent>
              </Card>

              {audit.tone_flags?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Flags de tom de voz</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {audit.tone_flags.map((f: any, i: number) => (
                      <div key={i} className="text-sm border-l-2 border-destructive/40 pl-3">
                        <Badge variant="outline" className="bg-destructive/10 text-destructive text-[10px] mr-2">{f.category}</Badge>
                        <span className="text-muted-foreground italic">"{f.quote}"</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {audit.churn_signals?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Sinais de risco de churn</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {audit.churn_signals.map((s: any, i: number) => (
                      <div key={i} className="text-sm border-l-2 border-warning/40 pl-3">
                        <Badge variant="outline" className="bg-warning/10 text-warning text-[10px] mr-2">{s.type}</Badge>
                        <span className="text-muted-foreground italic">"{s.quote}"</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {audit.competitor_mentions?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Menções a concorrentes</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {audit.competitor_mentions.map((c: any, i: number) => (
                      <div key={i} className="text-sm border-l-2 border-secondary/40 pl-3">
                        <Badge variant="outline" className="text-[10px] mr-2">{c.name}</Badge>
                        <span className="text-muted-foreground italic">"{c.quote}"</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {audit.playbook_checks?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Checklist do playbook</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-sm">
                      {audit.playbook_checks.map((c: any, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", c.passed ? "bg-success" : "bg-destructive")} />
                          <span className={cn(!c.passed && "text-muted-foreground")}>{c.key}</span>
                          {c.note && <span className="text-xs text-muted-foreground italic">— {c.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {isManager && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Revisão</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground">Status atual: <Badge variant="outline" className={REVIEW_META[audit.review_status]?.cls}>{REVIEW_META[audit.review_status]?.label}</Badge></div>
                    <Textarea placeholder="Notas da revisão (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="destructive" disabled={isReviewing} onClick={() => onReview({ id: audit.id, status: "confirmed", notes })}>Confirmar flag</Button>
                      <Button size="sm" variant="outline" disabled={isReviewing} onClick={() => onReview({ id: audit.id, status: "false_positive", notes })}>Falso positivo</Button>
                      <Button size="sm" variant="ghost" disabled={isReviewing} onClick={() => onReview({ id: audit.id, status: "dismissed", notes })}>Descartar</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
