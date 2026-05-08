import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, ExternalLink, Check, X, Pencil, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";

export default function ChatwootAuditReview() {
  const { role } = useAuth();
  if (role !== "admin") return <Navigate to="/atendimentos/auditoria" replace />;
  const qc = useQueryClient();
  const { buildConversationUrl } = useChatwootIntegration();

  const [tab, setTab] = useState("to_review");
  const [assignee, setAssignee] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [adjustOpen, setAdjustOpen] = useState<any>(null);
  const [goldenOpen, setGoldenOpen] = useState<any>(null);

  const { data: settings } = useQuery({
    queryKey: ["audit-settings-review"],
    queryFn: async () => {
      const { data } = await supabase.from("chatwoot_audit_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ["audit-review", tab, assignee, severity, search],
    queryFn: async () => {
      let q = supabase.from("chatwoot_conversation_audits").select("*").order("conversation_resolved_at", { ascending: false }).limit(1000);
      if (tab === "pending" || tab === "to_review") q = q.eq("review_status", "pending");
      else if (tab === "approved") q = q.in("review_status", ["confirmed"]);
      else if (tab === "adjusted") q = q.not("human_reviewed_at", "is", null);
      else if (tab === "rejected") q = q.eq("review_status", "false_positive");
      // "all" -> sem filtro de status
      if (assignee !== "all") q = q.eq("assignee_email", assignee);
      if (severity !== "all") q = q.eq("severity", severity);
      if (search.trim()) q = q.or(`summary.ilike.%${search}%,assignee_name.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Determina se uma auditoria entra na amostra de revisão humana
  const isInReviewSample = (a: any): boolean => {
    if (!settings) return true;
    const sevEff = a.human_severity || a.severity;
    if (settings.must_review_critical && sevEff === "critical") return true;
    if (settings.must_review_low_confidence && a.ai_confidence != null && Number(a.ai_confidence) < Number(settings.low_confidence_threshold || 60)) return true;
    if (settings.must_review_sla_breach) {
      const tm1r = a.sla_compliance?.tm1r_seconds;
      if (tm1r != null && Number(tm1r) > Number(settings.sla_breach_seconds || 1800)) return true;
    }
    const pct = Number(settings.human_review_percent_per_seller || 0);
    if (pct >= 100) return true;
    if (pct <= 0) return false;
    // Hash determinístico do id para amostra consistente
    let h = 0;
    const s = String(a.id || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 100 < pct;
  };

  const rows = useMemo(() => {
    if (tab !== "to_review") return rawRows;
    return rawRows.filter(isInReviewSample);
  }, [rawRows, tab, settings]);

  const reviewSampleStats = useMemo(() => {
    if (tab !== "to_review") return null;
    const total = rawRows.length;
    const inSample = rawRows.filter(isInReviewSample).length;
    return { total, inSample, pct: total ? Math.round((inSample / total) * 100) : 0 };
  }, [rawRows, tab, settings]);

  const assignees = useMemo(() => {
    const m = new Map<string, string>();
    rawRows.forEach((r: any) => r.assignee_email && m.set(r.assignee_email, r.assignee_name || r.assignee_email));
    return Array.from(m.entries());
  }, [rawRows]);

  const reviewMut = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await supabase.from("chatwoot_conversation_audits")
        .update({ review_status: status, review_notes: notes ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revisão registrada.");
      qc.invalidateQueries({ queryKey: ["audit-review"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustMut = useMutation({
    mutationFn: async (p: { id: string; human_overall_score: number; human_severity: string; override_reason: string; human_notes: string }) => {
      const u = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("chatwoot_conversation_audits").update({
        human_overall_score: p.human_overall_score,
        human_severity: p.human_severity,
        override_reason: p.override_reason,
        human_notes: p.human_notes,
        human_reviewed_by: u?.id,
        human_reviewed_at: new Date().toISOString(),
        review_status: "confirmed",
      }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajuste registrado.");
      setAdjustOpen(null);
      qc.invalidateQueries({ queryKey: ["audit-review"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const goldenMut = useMutation({
    mutationFn: async (p: { conversation_id: number; expected_severity: string; expected_overall_score: number; notes: string }) => {
      const u = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("chatwoot_audit_golden_set").upsert({
        conversation_id: p.conversation_id,
        expected_severity: p.expected_severity,
        expected_overall_score: p.expected_overall_score,
        notes: p.notes,
        created_by: u?.id,
      }, { onConflict: "conversation_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conversa adicionada ao Golden Set.");
      setGoldenOpen(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Layout>
      <div className="space-y-5 p-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/atendimentos/auditoria"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
          <h1 className="text-2xl font-heading font-bold">Fila de Revisão</h1>
          <p className="text-sm text-muted-foreground">Aprove, ajuste ou rejeite as auditorias da IA. Use atalhos do teclado: A aprovar, E ajustar, R rejeitar.</p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos atendentes</SelectItem>
                {assignees.map(([em, nm]) => <SelectItem key={em} value={em}>{nm}</SelectItem>)}
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
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="approved">Aprovadas</TabsTrigger>
            <TabsTrigger value="adjusted">Ajustadas</TabsTrigger>
            <TabsTrigger value="rejected">Rejeitadas</TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            <Card>
              <CardHeader><CardTitle className="text-base">{rows.length} auditoria(s)</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nada por aqui.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sev. IA</TableHead>
                        <TableHead>Sev. Humana</TableHead>
                        <TableHead>Atendente</TableHead>
                        <TableHead>Resumo</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="w-[280px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell><Badge variant="outline">{r.severity}</Badge></TableCell>
                          <TableCell>{r.human_severity ? <Badge>{r.human_severity}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell className="text-sm">{r.assignee_name || "—"}</TableCell>
                          <TableCell className="max-w-md truncate text-xs text-muted-foreground">{r.summary}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.human_overall_score != null ? <><span className="line-through text-muted-foreground text-xs mr-1">{Number(r.overall_score).toFixed(0)}</span>{Number(r.human_overall_score).toFixed(0)}</> : Number(r.overall_score).toFixed(0)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {buildConversationUrl(r.conversation_id) && (
                                <Button asChild size="icon" variant="ghost" title="Abrir Chatwoot">
                                  <a href={buildConversationUrl(r.conversation_id)!} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => reviewMut.mutate({ id: r.id, status: "confirmed" })} disabled={reviewMut.isPending}>
                                <Check className="h-3 w-3 mr-1" /> Aprovar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(r)}>
                                <Pencil className="h-3 w-3 mr-1" /> Ajustar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => reviewMut.mutate({ id: r.id, status: "false_positive" })} disabled={reviewMut.isPending}>
                                <X className="h-3 w-3 mr-1" /> Rejeitar
                              </Button>
                              <Button size="icon" variant="ghost" title="Marcar como Golden" onClick={() => setGoldenOpen(r)}>
                                <Star className="h-4 w-4" />
                              </Button>
                            </div>
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

        {/* Dialog de Ajuste */}
        <AdjustDialog open={!!adjustOpen} audit={adjustOpen} onClose={() => setAdjustOpen(null)} onSubmit={(p) => adjustMut.mutate(p)} pending={adjustMut.isPending} />
        <GoldenDialog open={!!goldenOpen} audit={goldenOpen} onClose={() => setGoldenOpen(null)} onSubmit={(p) => goldenMut.mutate(p)} pending={goldenMut.isPending} />
      </div>
    </Layout>
  );
}

function AdjustDialog({ open, audit, onClose, onSubmit, pending }: any) {
  const [score, setScore] = useState(0);
  const [sev, setSev] = useState("ok");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useMemo(() => {
    if (audit) {
      setScore(Math.round(Number(audit.human_overall_score ?? audit.overall_score) || 0));
      setSev(audit.human_severity || audit.severity || "ok");
      setReason(audit.override_reason || "");
      setNotes(audit.human_notes || "");
    }
  }, [audit]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar análise</DialogTitle>
          <DialogDescription>Sua nota substitui a da IA nos rankings e no dashboard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Score humano</Label>
              <Input type="number" value={score} onChange={(e) => setScore(Number(e.target.value))} min={0} max={100} />
            </div>
            <div>
              <Label>Severidade humana</Label>
              <Select value={sev} onValueChange={setSev}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="attention">Atenção</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Motivo do ajuste</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: IA superestimou o tom de voz" />
          </div>
          <div>
            <Label>Notas adicionais</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSubmit({ id: audit.id, human_overall_score: score, human_severity: sev, override_reason: reason, human_notes: notes })} disabled={pending}>
            {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Salvar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoldenDialog({ open, audit, onClose, onSubmit, pending }: any) {
  const [sev, setSev] = useState("ok");
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState("");

  useMemo(() => {
    if (audit) {
      setSev(audit.human_severity || audit.severity || "ok");
      setScore(Math.round(Number(audit.human_overall_score ?? audit.overall_score) || 0));
      setNotes("");
    }
  }, [audit]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar ao Golden Set</DialogTitle>
          <DialogDescription>Esta conversa será usada como referência para calibrar a IA.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Severidade esperada</Label>
              <Select value={sev} onValueChange={setSev}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="attention">Atenção</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Score esperado</Label>
              <Input type="number" value={score} onChange={(e) => setScore(Number(e.target.value))} min={0} max={100} />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Por que esta conversa é referência?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSubmit({ conversation_id: audit.conversation_id, expected_severity: sev, expected_overall_score: score, notes })} disabled={pending}>
            {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
