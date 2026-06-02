import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Layout } from "@/components/Layout";
import { ManagerOnly } from "@/components/ManagerOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Upload, RefreshCw, Plus, Trash2, Save, Pencil, X, MessageCircle, CheckCircle2, Circle, Eraser, Bot, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CHANNEL_OPTIONS, STATUS_OPTIONS, CONTACT_STATUS_OPTIONS, mergeCampaignProgress, statusBadgeClass, sumSnapshotMetrics } from "@/lib/salesCampaigns";

type Campaign = any;
type ContactRow = any;

export default function SalesCampaignDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["sales-campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_campaigns").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Campaign;
    },
  });

  // Realtime: invalidate detail/overview/evolution queries when related tables change
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`sales-campaign-${id}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_campaign_snapshots", filter: `campaign_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["scc-overview", id] });
        qc.invalidateQueries({ queryKey: ["scs", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_campaign_contacts", filter: `campaign_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["scc-overview", id] });
        qc.invalidateQueries({ queryKey: ["scc", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_campaigns", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["sales-campaign", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc]);

  if (isLoading || !campaign) {
    return (
      <ManagerOnly><Layout><div className="text-muted-foreground p-6">Carregando...</div></Layout></ManagerOnly>
    );
  }

  return (
    <ManagerOnly>
      <Layout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/sales-campaigns")}>
              <ArrowLeft className="h-4 w-4 mr-1" />Voltar
            </Button>
            <div className="flex-1">
              <h1 className="font-heading font-bold text-2xl">{campaign.name}</h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <Badge className={statusBadgeClass(campaign.status)}>{STATUS_OPTIONS.find((o) => o.value === campaign.status)?.label}</Badge>
                <span>{CHANNEL_OPTIONS.find((o) => o.value === campaign.channel)?.label}</span>
                {campaign.area && <span>· Área: {campaign.area}</span>}
                {campaign.segment && <span>· {campaign.segment}</span>}
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="base">Base</TabsTrigger>
              <TabsTrigger value="evolution">Evolução</TabsTrigger>
              <TabsTrigger value="config">Configuração</TabsTrigger>
            </TabsList>

            <TabsContent value="overview"><OverviewTab campaign={campaign} /></TabsContent>
            <TabsContent value="base"><BaseTab campaign={campaign} onChange={() => qc.invalidateQueries({ queryKey: ["scc", id] })} /></TabsContent>
            <TabsContent value="evolution"><EvolutionTab campaign={campaign} /></TabsContent>
            <TabsContent value="config"><ConfigTab campaign={campaign} onSaved={() => qc.invalidateQueries({ queryKey: ["sales-campaign", id] })} /></TabsContent>
          </Tabs>
        </div>
      </Layout>
    </ManagerOnly>
  );
}

// =============== OVERVIEW ===============
function OverviewTab({ campaign }: { campaign: Campaign }) {
  const { data: agg } = useQuery({
    queryKey: ["scc-overview", campaign.id],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      let base = 0, contacted = 0, replies = 0, meetings = 0, conversions = 0, mrr = 0, noPhone = 0;
      const mkBucket = () => ({ count: 0, contacted: 0, replies: 0, meetings: 0, conversions: 0, mrr: 0 });
      const ia = mkBucket();
      const human = mkBucket();
      let unclassified = 0;
      while (true) {
        const { data: contacts, error } = await supabase
          .from("sales_campaign_contacts")
          .select("status, mrr_generated, phone_digits, handled_by_ia, handled_by_human")
          .eq("campaign_id", campaign.id)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!contacts || contacts.length === 0) break;
        for (const c of contacts) {
          base++;
          const isContacted = ["contatado", "respondeu", "agendado", "convertido"].includes(c.status);
          const isReply = ["respondeu", "agendado", "convertido"].includes(c.status);
          const isMeeting = c.status === "agendado";
          const isConv = c.status === "convertido";
          const mrrVal = Number(c.mrr_generated || 0);
          if (isContacted) contacted++;
          if (isReply) replies++;
          if (isMeeting) meetings++;
          if (isConv) conversions++;
          if (!c.phone_digits) noPhone++;
          mrr += mrrVal;
          const accumulate = (b: any) => {
            b.count++;
            if (isContacted) b.contacted++;
            if (isReply) b.replies++;
            if (isMeeting) b.meetings++;
            if (isConv) b.conversions++;
            b.mrr += mrrVal;
          };
          if (c.handled_by_ia) accumulate(ia);
          if (c.handled_by_human) accumulate(human);
          if (!c.handled_by_ia && !c.handled_by_human) unclassified++;
        }
        if (contacts.length < PAGE) break;
        from += PAGE;
      }
      const { data: snapshots } = await supabase
        .from("sales_campaign_snapshots")
        .select("snapshot_date, contacted, replies, meetings, conversions, mrr_generated")
        .eq("campaign_id", campaign.id)
        .order("snapshot_date", { ascending: true });
      const { data: finance } = await supabase.from("finance_settings").select("avg_churn_rate").limit(1).maybeSingle();
      return { base, contacted, replies, meetings, conversions, mrr, noPhone, ia, human, unclassified, snapshots: snapshots || [], fallbackChurn: Number(finance?.avg_churn_rate || 0) };
    },
  });

  const emptyBucket = { count: 0, contacted: 0, replies: 0, meetings: 0, conversions: 0, mrr: 0 };
  const a: any = agg || { base: 0, contacted: 0, replies: 0, meetings: 0, conversions: 0, mrr: 0, noPhone: 0, ia: emptyBucket, human: emptyBucket, unclassified: 0, snapshots: [], fallbackChurn: 0 };
  const snapTotals = sumSnapshotMetrics(a.snapshots);
  const contacted = a.contacted + (snapTotals.contacted || 0);
  const replies = a.replies + (snapTotals.replies || 0);
  const meetings = (a.meetings || 0) + (snapTotals.meetings || 0);
  const conversions = a.conversions + (snapTotals.conversions || 0);
  const mrr = a.mrr + (snapTotals.mrr || 0);
  const replyRate = contacted > 0 ? ((replies / contacted) * 100).toFixed(1) : "0.0";
  const convRate = contacted > 0 ? ((conversions / contacted) * 100).toFixed(1) : "0.0";
  const convOverReplies = replies > 0 ? ((conversions / replies) * 100).toFixed(1) : "0.0";
  const meetingRate = contacted > 0 ? ((meetings / contacted) * 100).toFixed(1) : "0.0";
  const contactedRate = a.base > 0 ? ((contacted / a.base) * 100).toFixed(1) : "0.0";
  const budget = Number(campaign.budget) || 0;
  const fmtBRL = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  const roi = budget > 0 ? `${((mrr / budget) * 100).toFixed(0)}%` : "—";
  const cac = conversions > 0 && budget > 0 ? budget / conversions : 0;
  const monthlyChurn = (Number(campaign.churn_rate) || a.fallbackChurn || 0) / 100;
  const monthlyTicket = conversions > 0 ? mrr / conversions : 0;

  const [ltvPeriod, setLtvPeriod] = useState<"mensal" | "anual" | "custom">("mensal");
  const [ltvMonths, setLtvMonths] = useState<string>("12");

  const ltvCalc = (() => {
    if (monthlyTicket <= 0 || monthlyChurn <= 0) return { ltv: 0, label: "LTV / CAC", desc: "" };
    if (ltvPeriod === "mensal") {
      const ltv = monthlyTicket / monthlyChurn;
      return { ltv, label: "LTV / CAC (Mensal)", desc: `LTV ${fmtBRL(ltv)} · vida ${(1 / monthlyChurn).toFixed(1)} meses` };
    }
    if (ltvPeriod === "anual") {
      const annualTicket = monthlyTicket * 12;
      const annualChurn = 1 - Math.pow(1 - monthlyChurn, 12);
      const ltv = annualChurn > 0 ? annualTicket / annualChurn : 0;
      return { ltv, label: "LTV / CAC (Anual)", desc: `LTV ${fmtBRL(ltv)} · churn anual ${(annualChurn * 100).toFixed(1)}%` };
    }
    const n = Math.max(1, Number(ltvMonths) || 12);
    const maxLife = 1 / monthlyChurn;
    const horizon = Math.min(n, maxLife);
    const ltv = monthlyTicket * horizon;
    return { ltv, label: `LTV / CAC (${n}m)`, desc: `LTV ${fmtBRL(ltv)} · horizonte ${horizon.toFixed(1)} meses` };
  })();

  const ltvCacRatio = cac > 0 && ltvCalc.ltv > 0 ? ltvCalc.ltv / cac : 0;
  const churnPctLabel = monthlyChurn > 0 ? `${(monthlyChurn * 100).toFixed(1)}%` : "—";

  const funnel = [
    { stage: "Base", value: a.base },
    { stage: "Contatados", value: contacted },
    { stage: "Respostas", value: replies },
    { stage: "Reuniões", value: meetings },
    { stage: "Conversões", value: conversions },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <ChatwootTagSyncButton campaignId={campaign.id} />
        <Label className="text-xs text-muted-foreground">Período LTV/CAC:</Label>
        <Select value={ltvPeriod} onValueChange={(v) => setLtvPeriod(v as any)}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mensal">Mensal</SelectItem>
            <SelectItem value="anual">Anual</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {ltvPeriod === "custom" && (
          <Input type="number" min={1} value={ltvMonths} onChange={(e) => setLtvMonths(e.target.value)} className="w-24 h-8 text-xs" placeholder="meses" />
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Base" value={a.base} target={campaign.target_contacted} />
        <Kpi label="Contatados" value={contacted} target={campaign.target_contacted} sub={`${contactedRate}% da base`} />
        <Kpi label="Respostas" value={replies} target={campaign.target_replies} sub={`${replyRate}% dos contatados`} />
        <Kpi label="Sem telefone" value={a.noPhone} sub={a.base > 0 ? `${((a.noPhone / a.base) * 100).toFixed(1)}% da base` : undefined} />
        <Kpi label="Reuniões" value={meetings} sub={`${meetingRate}% dos contatados`} />
        <Kpi label="Conversões" value={conversions} target={campaign.target_conversions} sub={`${convRate}% contat. · ${convOverReplies}% resp.`} />
        <Kpi label="MRR" value={fmtBRL(mrr)} target={Number(campaign.target_mrr)} isCurrency />
        <Kpi label="Investimento" value={fmtBRL(budget)} sub={budget === 0 ? "Defina em Configuração" : undefined} />
        <Kpi label="ROI" value={roi} sub={budget > 0 ? "MRR ÷ investimento" : "Sem investimento"} />
        <Kpi label="CAC" value={cac > 0 ? fmtBRL(cac) : "—"} sub={conversions > 0 ? `${conversions} conversões` : "Sem conversões"} />
        <Kpi label={ltvCalc.label} value={ltvCacRatio > 0 ? `${ltvCacRatio.toFixed(2)}x` : "—"} sub={monthlyChurn > 0 ? `${ltvCalc.desc} · churn ${churnPctLabel}` : "Defina o churn"} />
      </div>

      <BucketComparisonCards base={a.base} ia={a.ia} human={a.human} unclassified={a.unclassified} fmtBRL={fmtBRL} />




      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Funil</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={12} width={90} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução temporal</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            {a.snapshots.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center justify-center h-full">Nenhum snapshot. Cadastre na aba Evolução.</div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={a.snapshots}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="snapshot_date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="contacted" stroke="hsl(var(--primary))" name="Contatados" />
                  <Line type="monotone" dataKey="replies" stroke="hsl(var(--secondary))" name="Respostas" />
                  <Line type="monotone" dataKey="conversions" stroke="hsl(var(--success))" name="Conversões" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, target, sub, isCurrency }: { label: string; value: any; target?: number; sub?: string; isCurrency?: boolean }) {
  const num = typeof value === "number" ? value : 0;
  const pct = target && target > 0 ? Math.round((num / target) * 100) : null;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-heading font-bold mt-1">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {sub && <>{sub}{pct !== null && " · "}</>}
          {pct !== null && (isCurrency ? `${pct}% da meta` : `${pct}% / ${target}`)}
        </div>
      </CardContent>
    </Card>
  );
}

type Bucket = { count: number; contacted: number; replies: number; meetings: number; conversions: number; mrr: number };

function BucketCard({ title, icon, accent, bucket: bucketProp, base, fmtBRL }: { title: string; icon: React.ReactNode; accent: string; bucket?: Bucket; base: number; fmtBRL: (n: number) => string }) {
  const bucket: Bucket = bucketProp || { count: 0, contacted: 0, replies: 0, meetings: 0, conversions: 0, mrr: 0 };
  const pctBase = base > 0 ? ((bucket.count / base) * 100).toFixed(0) : "0";
  const replyRate = bucket.contacted > 0 ? ((bucket.replies / bucket.contacted) * 100).toFixed(1) : "0.0";
  const meetingRate = bucket.contacted > 0 ? ((bucket.meetings / bucket.contacted) * 100).toFixed(1) : "0.0";
  const convRate = bucket.contacted > 0 ? ((bucket.conversions / bucket.contacted) * 100).toFixed(1) : "0.0";
  const Row = ({ label, value, hint }: { label: string; value: any; hint?: string }) => (
    <div className="flex items-baseline justify-between text-sm py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {value}
        {hint && <span className="text-muted-foreground text-xs ml-2">{hint}</span>}
      </span>
    </div>
  );
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className={`inline-flex items-center justify-center h-7 w-7 rounded-md ${accent}`}>{icon}</span>
            {title}
          </CardTitle>
          <div className="text-right">
            <div className="text-xl font-heading font-bold tabular-nums">{bucket.count}</div>
            <div className="text-[11px] text-muted-foreground">{pctBase}% da base</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Row label="Contatados" value={bucket.contacted} />
        <Row label="Respostas" value={bucket.replies} hint={`${replyRate}%`} />
        <Row label="Reuniões" value={bucket.meetings} hint={`${meetingRate}%`} />
        <Row label="Conversões" value={bucket.conversions} hint={`${convRate}%`} />
        <Row label="MRR" value={fmtBRL(bucket.mrr)} />
      </CardContent>
    </Card>
  );
}

function BucketComparisonCards({ base, ia, human, unclassified, fmtBRL }: { base: number; ia: Bucket; human: Bucket; unclassified: number; fmtBRL: (n: number) => string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Atendimento: IA × Humano</CardTitle>
            <CardDescription className="text-xs">
              Marque cada contato como IA, Humano ou ambos (handoff) na aba Base. Contatos em handoff aparecem nos dois cards.
            </CardDescription>
          </div>
          {unclassified > 0 && (
            <Badge variant="outline" className="text-xs">
              {unclassified} sem classificação
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-3">
          <BucketCard title="Atendimento IA" icon={<Bot className="h-4 w-4" />} accent="bg-primary/15 text-primary" bucket={ia} base={base} fmtBRL={fmtBRL} />
          <BucketCard title="Atendimento Humano" icon={<User className="h-4 w-4" />} accent="bg-secondary/15 text-secondary" bucket={human} base={base} fmtBRL={fmtBRL} />
        </div>
      </CardContent>
    </Card>
  );
}

function ChatwootTagSyncButton({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [targetStatus, setTargetStatus] = useState<"contatado" | "respondeu">("respondeu");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function loadLabels() {
    setLoadingLabels(true);
    try {
      const { data, error } = await supabase.rpc("get_chatwoot_labels" as any);
      if (error) throw error;
      setLabels((data as string[]) || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar tags", description: e.message, variant: "destructive" });
    } finally {
      setLoadingLabels(false);
    }
  }

  useEffect(() => { if (open) loadLabels(); }, [open]);

  async function run() {
    if (!selectedLabel) {
      toast({ title: "Selecione uma tag", variant: "destructive" });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sales-campaign-sync-chatwoot-tag", {
        body: { campaign_id: campaignId, label: selectedLabel, target_status: targetStatus },
      });
      if (error) throw error;
      setResult(data);
      toast({
        title: "Sincronização concluída",
        description: `${data?.matched ?? 0} match · ${data?.promoted ?? 0} atualizados`,
      });
      qc.invalidateQueries({ queryKey: ["scc-overview", campaignId] });
      qc.invalidateQueries({ queryKey: ["scc", campaignId] });
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(true)}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sincronizar com Chatwoot
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar contatos via tag do Chatwoot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tag do Chatwoot</Label>
              <Select value={selectedLabel} onValueChange={setSelectedLabel} disabled={loadingLabels}>
                <SelectTrigger><SelectValue placeholder={loadingLabels ? "Carregando..." : "Selecione uma tag"} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {labels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Match por telefone (primário) e email (fallback).
              </p>
            </div>
            <div>
              <Label className="text-xs">Marcar contatos como</Label>
              <Select value={targetStatus} onValueChange={(v) => setTargetStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contatado">Contatado</SelectItem>
                  <SelectItem value="respondeu">Respondeu</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Não rebaixa quem já está em status superior. Contatos com a tag e ausentes da base serão adicionados.
              </p>
            </div>
            {result && (
              <div className="text-xs bg-muted/50 rounded p-2 space-y-0.5">
                <div>Contatos do Chatwoot com a tag: <b>{result.chatwoot_contacts_with_label}</b></div>
                <div>Match na base: <b>{result.matched}</b></div>
                <div>Atualizados: <b>{result.promoted}</b> · Já em status superior: {result.skipped_already_higher}</div>
                
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>Fechar</Button>
            <Button onClick={run} disabled={running || !selectedLabel}>
              {running ? "Sincronizando..." : "Executar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}



// =============== BASE TAB ===============
function BaseTab({ campaign, onChange }: { campaign: Campaign; onChange: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all"); // all | chatwoot | ops | none
  const [iaFilter, setIaFilter] = useState("all"); // all | ia | human | both | unclassified
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["scc", campaign.id, search, statusFilter, contactFilter, iaFilter, page],
    queryFn: async () => {
      let q = supabase
        .from("sales_campaign_contacts")
        .select("*", { count: "exact" })
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (contactFilter === "chatwoot") q = q.not("matched_chatwoot_contact_id", "is", null);
      if (contactFilter === "ops") q = q.eq("ops_contacted", true);
      if (contactFilter === "ac") q = q.not("matched_ac_deal_id", "is", null);
      if (contactFilter === "none") q = q.is("matched_chatwoot_contact_id", null).is("matched_ac_deal_id", null).eq("ops_contacted", false);
      if (iaFilter === "ia") q = q.eq("handled_by_ia", true).eq("handled_by_human", false);
      if (iaFilter === "human") q = q.eq("handled_by_human", true).eq("handled_by_ia", false);
      if (iaFilter === "both") q = q.eq("handled_by_ia", true).eq("handled_by_human", true);
      if (iaFilter === "unclassified") q = q.eq("handled_by_ia", false).eq("handled_by_human", false);
      if (search) {
        const s = search.replace(/[,()]/g, "");
        q = q.or(
          `name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,phone_digits.ilike.%${s}%,company.ilike.%${s}%,status.ilike.%${s}%,match_method.ilike.%${s}%,notes.ilike.%${s}%`
        );
      }
      const { data, error, count } = await q;
      if (error) throw error;

      // Enrich with Chatwoot details for matched contacts
      const cwIds = Array.from(
        new Set((data || []).map((r: any) => r.matched_chatwoot_contact_id).filter(Boolean))
      );
      let cwMap = new Map<number, any>();
      if (cwIds.length) {
        const { data: cw } = await supabase
          .from("chatwoot_contacts")
          .select("chatwoot_contact_id, name, email, last_activity_at, conversations_count")
          .in("chatwoot_contact_id", cwIds as any);
        for (const c of cw || []) cwMap.set(c.chatwoot_contact_id as any, c);
      }
      const rows = (data || []).map((r: any) => ({
        ...r,
        _cw: r.matched_chatwoot_contact_id ? cwMap.get(r.matched_chatwoot_contact_id) : null,
      }));
      return { rows, count: count || 0 };
    },
  });

  const updateStatus = async (rowId: string, status: string) => {
    const { error } = await supabase.from("sales_campaign_contacts").update({ status }).eq("id", rowId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { refetch(); onChange(); }
  };

  const toggleOpsContacted = async (row: any) => {
    const next = !row.ops_contacted;
    const { error } = await supabase
      .from("sales_campaign_contacts")
      .update({
        ops_contacted: next,
        ops_contacted_at: next ? new Date().toISOString() : null,
        ops_contacted_by: next ? user?.id ?? null : null,
      })
      .eq("id", row.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: next ? "Marcado como contatado por Ops" : "Marcação removida" });
      refetch();
      onChange();
    }
  };

  const toggleHandled = async (row: any, field: "handled_by_ia" | "handled_by_human") => {
    const next = !row[field];
    const patch: any = { [field]: next };
    if (field === "handled_by_ia" && next && !row.ia_source) patch.ia_source = "manual";
    const { error } = await supabase.from("sales_campaign_contacts").update(patch).eq("id", row.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { refetch(); onChange(); }
  };

  const [bulking, setBulking] = useState(false);
  const bulkApply = async (field: "handled_by_ia" | "handled_by_human", value: boolean) => {
    setBulking(true);
    const patch: any = { [field]: value };
    if (field === "handled_by_ia" && value) patch.ia_source = "manual";
    let q = supabase.from("sales_campaign_contacts").update(patch).eq("campaign_id", campaign.id);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (iaFilter === "ia") q = q.eq("handled_by_ia", true).eq("handled_by_human", false);
    if (iaFilter === "human") q = q.eq("handled_by_human", true).eq("handled_by_ia", false);
    if (iaFilter === "both") q = q.eq("handled_by_ia", true).eq("handled_by_human", true);
    if (iaFilter === "unclassified") q = q.eq("handled_by_ia", false).eq("handled_by_human", false);
    const { error } = await q;
    setBulking(false);
    if (error) toast({ title: "Erro no bulk", description: error.message, variant: "destructive" });
    else {
      toast({ title: `${value ? "Marcado" : "Desmarcado"} ${field === "handled_by_ia" ? "IA" : "Humano"}`, description: "Aplicado ao filtro atual" });
      refetch();
      onChange();
    }
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const pageIds: string[] = (data?.rows || []).map((r: any) => r.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const pageSomeSelected = pageIds.some((id) => selectedIds.has(id));
  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const bulkApplyToSelection = async (field: "handled_by_ia" | "handled_by_human", value: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulking(true);
    const patch: any = { [field]: value };
    if (field === "handled_by_ia" && value) patch.ia_source = "manual";
    const { error } = await supabase.from("sales_campaign_contacts").update(patch).in("id", ids);
    setBulking(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: `${value ? "Marcado" : "Desmarcado"} ${field === "handled_by_ia" ? "IA" : "Humano"}`, description: `${ids.length} contato(s) atualizado(s)` });
      refetch();
      onChange();
    }
  };

  const runMatch = async () => {
    toast({ title: "Casando contatos..." });
    const { data, error } = await supabase.functions.invoke("sales-campaign-match", { body: { campaign_id: campaign.id } });
    if (error) toast({ title: "Erro no match", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Match concluído", description: `${data?.matched || 0} casados, ${data?.converted || 0} convertidos` });
      refetch();
    }
  };

  const runAcSync = async () => {
    toast({ title: "Sincronizando com ActiveCampaign..." });
    const { data, error } = await supabase.functions.invoke("ac-sync-deal-stages", { body: { campaign_id: campaign.id } });
    if (error) toast({ title: "Erro no sync AC", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Sync AC concluído", description: `${data?.synced_deals || 0} deals · ${data?.updated_contacts || 0} contatos atualizados` });
      refetch();
    }
  };

  const clearBase = async () => {
    const { error, count } = await supabase
      .from("sales_campaign_contacts")
      .delete({ count: "exact" })
      .eq("campaign_id", campaign.id);
    if (error) {
      toast({ title: "Erro ao excluir base", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Base excluída", description: `${count ?? 0} contatos removidos` });
    setPage(0);
    refetch();
    onChange();
  };

  const exportCsv = () => {
    if (!data?.rows.length) return;
    const cols = ["name", "email", "phone", "company", "status", "mrr_generated", "match_method", "ops_contacted", "ops_contacted_at", "ac_last_stage", "ac_last_stage_at", "matched_ac_deal_id"];
    const csv = [cols.join(","), ...data.rows.map((r: any) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${campaign.name}-contatos.csv`;
    a.click();
  };

  const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ImportDialog campaign={campaign} onImported={() => { refetch(); onChange(); }} />
        <Button variant="outline" onClick={runMatch}><RefreshCw className="h-4 w-4 mr-2" />Casar com Chatwoot/Stripe/Active</Button>
        <Button variant="outline" onClick={runAcSync}><RefreshCw className="h-4 w-4 mr-2" />Sincronizar com ActiveCampaign</Button>
        <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive hover:text-destructive">
              <Eraser className="h-4 w-4 mr-2" />Excluir base
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir toda a base desta campanha?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove permanentemente todos os contatos importados em "{campaign.name}". Snapshots e configurações da campanha são preservados. Use quando a base foi subida com erro e precisa ser reimportada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={clearBase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir base
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="ml-auto flex flex-wrap gap-2">
          <Input placeholder="Buscar..." value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} className="w-48" />
          <Select value={contactFilter} onValueChange={(v) => { setPage(0); setContactFilter(v); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo contato prévio</SelectItem>
              <SelectItem value="chatwoot">Já teve Chatwoot</SelectItem>
              <SelectItem value="ops">Contatado por Ops</SelectItem>
              <SelectItem value="ac">Vinculado ao Active</SelectItem>
              <SelectItem value="none">Sem contato prévio</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setPage(0); setStatusFilter(v); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {CONTACT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={iaFilter} onValueChange={(v) => { setPage(0); setIaFilter(v); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos (IA/Humano)</SelectItem>
              <SelectItem value="ia">Só IA</SelectItem>
              <SelectItem value="human">Só Humano</SelectItem>
              <SelectItem value="both">Handoff (ambos)</SelectItem>
              <SelectItem value="unclassified">Não classificados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-primary/5 border border-primary/30 rounded-md px-3 py-2">
          <span className="font-medium">{selectedIds.size} selecionado(s):</span>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApplyToSelection("handled_by_ia", true)}>
            <Bot className="h-3 w-3 mr-1" />Marcar IA
          </Button>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApplyToSelection("handled_by_ia", false)}>Desmarcar IA</Button>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApplyToSelection("handled_by_human", true)}>
            <User className="h-3 w-3 mr-1" />Marcar Humano
          </Button>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApplyToSelection("handled_by_human", false)}>Desmarcar Humano</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="ml-auto">Limpar seleção</Button>
        </div>
      )}

      {iaFilter !== "all" && selectedIds.size === 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-muted/40 border rounded-md px-3 py-2">
          <span className="text-muted-foreground">Aplicar a todo o filtro atual:</span>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApply("handled_by_ia", true)}>
            <Bot className="h-3 w-3 mr-1" />Marcar IA
          </Button>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApply("handled_by_ia", false)}>Desmarcar IA</Button>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApply("handled_by_human", true)}>
            <User className="h-3 w-3 mr-1" />Marcar Humano
          </Button>
          <Button size="sm" variant="outline" disabled={bulking} onClick={() => bulkApply("handled_by_human", false)}>Desmarcar Humano</Button>
        </div>
      )}


      <div className="border rounded-md overflow-x-auto">
        <TooltipProvider delayDuration={150}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contato prévio</TableHead>
              <TableHead>AC</TableHead>
              <TableHead className="text-center">Ops</TableHead>
              <TableHead className="text-center">IA</TableHead>
              <TableHead className="text-center">Humano</TableHead>
              <TableHead className="text-right">MRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>}
            {!isLoading && data?.rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">Nenhum contato</TableCell></TableRow>}
            {data?.rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name || "—"}</TableCell>
                <TableCell className="text-xs">{r.email || "—"}</TableCell>
                <TableCell className="text-xs">{r.phone || "—"}</TableCell>
                <TableCell className="text-xs">{r.company || "—"}</TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                    <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONTACT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1 items-center">
                    {r.matched_chatwoot_contact_id ? (
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="cursor-help gap-1">
                            <MessageCircle className="h-3 w-3" /> CW
                            {r.match_method && <span className="opacity-60">·{r.match_method}</span>}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <div className="font-medium">{r._cw?.name || "Contato Chatwoot"}</div>
                          {r._cw?.email && <div>{r._cw.email}</div>}
                          <div>Conversas: {r._cw?.conversations_count ?? 0}</div>
                          <div>Última atividade: {fmtDate(r._cw?.last_activity_at)}</div>
                        </TooltipContent>
                      </UITooltip>
                    ) : null}
                    {r.matched_opportunity_id && <Badge variant="outline">Stripe</Badge>}
                    {r.ops_contacted && (
                      <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Ops</Badge>
                    )}
                    {!r.matched_chatwoot_contact_id && !r.matched_opportunity_id && !r.ops_contacted && "—"}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {r.matched_ac_deal_id ? (
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="cursor-help gap-1">
                          {r.ac_last_stage || "vinculado"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <div>Deal AC: {r.matched_ac_deal_id}</div>
                        <div>Última mudança: {fmtDate(r.ac_last_stage_at)}</div>
                        <div>Sync: {fmtDate(r.ac_synced_at)}</div>
                      </TooltipContent>
                    </UITooltip>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-center">
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleOpsContacted(r)}
                      >
                        {r.ops_contacted
                          ? <CheckCircle2 className="h-4 w-4 text-success" />
                          : <Circle className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {r.ops_contacted
                        ? `Contatado por Ops em ${fmtDate(r.ops_contacted_at)} — clique para remover`
                        : "Marcar como contatado por Operações"}
                    </TooltipContent>
                  </UITooltip>
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox checked={!!r.handled_by_ia} onCheckedChange={() => toggleHandled(r, "handled_by_ia")} aria-label="Marcar como atendido por IA" />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox checked={!!r.handled_by_human} onCheckedChange={() => toggleHandled(r, "handled_by_human")} aria-label="Marcar como atendido por humano" />
                </TableCell>
                <TableCell className="text-right">R$ {Number(r.mrr_generated || 0).toFixed(0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TooltipProvider>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{data?.count || 0} contatos · página {page + 1}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= (data?.count || 0)} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}

// =============== IMPORT DIALOG ===============
function ImportDialog({ campaign, onImported }: { campaign: Campaign; onImported: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "uploading">("upload");
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep("upload"); setRawRows([]); setHeaders([]); setMapping({}); setFileName(""); };

  const onFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    if (json.length === 0) { toast({ title: "Arquivo vazio", variant: "destructive" }); return; }
    setRawRows(json);
    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    // Auto-mapping heuristic
    const auto: Record<string, string> = {};
    for (const h of hdrs) {
      const l = h.toLowerCase();
      if (!auto.email && (l.includes("email") || l.includes("e-mail"))) auto.email = h;
      else if (!auto.phone && (l.includes("phone") || l.includes("telefone") || l.includes("celular"))) auto.phone = h;
      else if (!auto.name && (l === "nome" || l.includes("name"))) auto.name = h;
      else if (!auto.company && (l.includes("empresa") || l.includes("company"))) auto.company = h;
    }
    setMapping(auto);
    setStep("map");
  };

  const submit = async () => {
    setStep("uploading");
    const toStr = (v: any) => (v === null || v === undefined || v === "" ? null : String(v).trim());
    const rows = rawRows.map((r) => {
      const out: any = {
        name: mapping.name ? toStr(r[mapping.name]) : null,
        email: mapping.email ? toStr(r[mapping.email]) : null,
        phone: mapping.phone ? toStr(r[mapping.phone]) : null,
        company: mapping.company ? toStr(r[mapping.company]) : null,
        extra: {} as Record<string, any>,
      };
      // Put unmapped columns into extra
      for (const h of headers) {
        if (!Object.values(mapping).includes(h)) out.extra[h] = r[h];
      }
      return out;
    });
    const { data, error } = await supabase.functions.invoke("sales-campaign-import", {
      body: { campaign_id: campaign.id, file_name: fileName, mapping, rows },
    });
    if (error || (data as any)?.error) {
      const detail = (data as any)?.error ? JSON.stringify((data as any).error) : error?.message;
      toast({ title: "Erro no upload", description: detail, variant: "destructive" });
      setStep("map");
      return;
    }
    toast({ title: "Base importada", description: `${data?.inserted || 0} contatos inseridos` });
    setOpen(false);
    reset();
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4 mr-2" />Subir base</Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar base ({step === "map" ? "mapear colunas" : "selecionar arquivo"})</DialogTitle></DialogHeader>
        {step === "upload" && (
          <div className="space-y-3">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button onClick={() => fileRef.current?.click()}>Escolher arquivo Excel/CSV</Button>
            <p className="text-xs text-muted-foreground">A primeira linha deve conter os cabeçalhos. Colunas não mapeadas ficam disponíveis no campo "extra".</p>
          </div>
        )}
        {step === "map" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{rawRows.length} linhas detectadas. Mapeie as colunas:</p>
            <div className="grid grid-cols-2 gap-3">
              {(["name", "email", "phone", "company"] as const).map((field) => (
                <div key={field}>
                  <Label className="capitalize">{field === "name" ? "Nome" : field === "email" ? "E-mail" : field === "phone" ? "Telefone" : "Empresa"}</Label>
                  <Select value={mapping[field] || "__none__"} onValueChange={(v) => setMapping({ ...mapping, [field]: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— ignorar —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={submit}>Importar {rawRows.length} contatos</Button>
            </DialogFooter>
          </div>
        )}
        {step === "uploading" && <div className="py-6 text-center text-muted-foreground">Enviando...</div>}
      </DialogContent>
    </Dialog>
  );
}

// =============== EVOLUTION TAB ===============
function EvolutionTab({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    snapshot_date: new Date().toISOString().slice(0, 10),
    contacted: "0", replies: "0", meetings: "0", conversions: "0",
    mrr_generated: "0", notes: "",
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({
      snapshot_date: new Date().toISOString().slice(0, 10),
      contacted: "0", replies: "0", meetings: "0", conversions: "0",
      mrr_generated: "0", notes: "",
    });
  };

  const startEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      snapshot_date: String(s.snapshot_date).slice(0, 10),
      contacted: String(s.contacted ?? 0),
      replies: String(s.replies ?? 0),
      meetings: String(s.meetings ?? 0),
      conversions: String(s.conversions ?? 0),
      mrr_generated: String(s.mrr_generated ?? 0),
      notes: s.notes || "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const { data: snapshots = [], refetch } = useQuery({
    queryKey: ["scs", campaign.id],
    queryFn: async () => {
      const { data } = await supabase.from("sales_campaign_snapshots").select("*").eq("campaign_id", campaign.id).order("snapshot_date", { ascending: false });
      return data || [];
    },
  });

  const autoFill = async () => {
    const { data, error } = await supabase.functions.invoke("sales-campaign-auto-snapshot", { body: { campaign_id: campaign.id } });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const p = data?.preview || {};
    setForm({
      ...form,
      contacted: String(p.contacted || 0),
      replies: String(p.replies || 0),
      meetings: String(p.meetings || 0),
      conversions: String(p.conversions || 0),
      mrr_generated: String(p.mrr_generated || 0),
    });
    toast({ title: "Valores calculados", description: "Ajuste se necessário e salve." });
  };

  const save = async () => {
    const payload = {
      snapshot_date: form.snapshot_date,
      contacted: Number(form.contacted) || 0,
      replies: Number(form.replies) || 0,
      meetings: Number(form.meetings) || 0,
      conversions: Number(form.conversions) || 0,
      mrr_generated: Number(form.mrr_generated) || 0,
      notes: form.notes || null,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from("sales_campaign_snapshots").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("sales_campaign_snapshots").insert({
        ...payload,
        campaign_id: campaign.id,
        created_by: user?.id,
        source: "manual",
      }));
    }
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Snapshot atualizado" : "Snapshot salvo" });
    resetForm();
    refetch();
    qc.invalidateQueries({ queryKey: ["scc-overview", campaign.id] });
  };

  const remove = async (id: string) => {
    await supabase.from("sales_campaign_snapshots").delete().eq("id", id);
    if (editingId === id) resetForm();
    refetch();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Editar evolução" : "Registrar evolução"}</CardTitle>
          <CardDescription>Preencha manualmente ou clique em "Calcular automaticamente" para puxar da base e cruzamentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            <div><Label>Data</Label><Input type="date" value={form.snapshot_date} onChange={(e) => setForm({ ...form, snapshot_date: e.target.value })} /></div>
            <div><Label>Contatados</Label><Input type="number" value={form.contacted} onChange={(e) => setForm({ ...form, contacted: e.target.value })} /></div>
            <div><Label>Respostas</Label><Input type="number" value={form.replies} onChange={(e) => setForm({ ...form, replies: e.target.value })} /></div>
            <div><Label>Reuniões</Label><Input type="number" value={form.meetings} onChange={(e) => setForm({ ...form, meetings: e.target.value })} /></div>
            <div><Label>Conversões</Label><Input type="number" value={form.conversions} onChange={(e) => setForm({ ...form, conversions: e.target.value })} /></div>
            <div><Label>MRR (R$)</Label><Input type="number" value={form.mrr_generated} onChange={(e) => setForm({ ...form, mrr_generated: e.target.value })} /></div>
            <div className="flex items-end gap-1">
              {!editingId && <Button variant="outline" onClick={autoFill} title="Calcular da base"><RefreshCw className="h-4 w-4" /></Button>}
              <Button onClick={save}><Save className="h-4 w-4 mr-1" />{editingId ? "Atualizar" : "Salvar"}</Button>
              {editingId && <Button variant="ghost" onClick={resetForm} title="Cancelar edição"><X className="h-4 w-4" /></Button>}
            </div>
          </div>
          <div><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead className="text-right">Contatados</TableHead><TableHead className="text-right">Respostas</TableHead>
              <TableHead className="text-right">Reuniões</TableHead><TableHead className="text-right">Conversões</TableHead><TableHead className="text-right">MRR</TableHead>
              <TableHead>Origem</TableHead><TableHead>Observações</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {snapshots.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Nenhum snapshot</TableCell></TableRow>}
              {snapshots.map((s: any) => {
                const [y, m, d] = String(s.snapshot_date).slice(0, 10).split("-");
                const dateLabel = y && m && d ? `${d}/${m}/${y}` : s.snapshot_date;
                return (
                <TableRow key={s.id} data-state={editingId === s.id ? "selected" : undefined}>
                  <TableCell>{dateLabel}</TableCell>
                  <TableCell className="text-right">{s.contacted}</TableCell>
                  <TableCell className="text-right">{s.replies}</TableCell>
                  <TableCell className="text-right">{s.meetings}</TableCell>
                  <TableCell className="text-right">{s.conversions}</TableCell>
                  <TableCell className="text-right">R$ {Number(s.mrr_generated).toFixed(0)}</TableCell>
                  <TableCell><Badge variant="outline">{s.source}</Badge></TableCell>
                  <TableCell className="max-w-[280px] whitespace-pre-wrap text-sm text-muted-foreground">{s.notes || <span className="text-muted-foreground/50">—</span>}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s.id)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


// =============== CONFIG TAB ===============
function ConfigTab({ campaign, onSaved }: { campaign: Campaign; onSaved: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description || "",
    channel: campaign.channel,
    segment: campaign.segment || "",
    area: campaign.area || "",
    status: campaign.status,
    start_date: campaign.start_date || "",
    end_date: campaign.end_date || "",
    budget: String(campaign.budget),
    churn_rate: campaign.churn_rate != null ? String(campaign.churn_rate) : "",
    priority: String(campaign.priority ?? 0),
    target_contacted: String(campaign.target_contacted),
    target_replies: String(campaign.target_replies),
    target_conversions: String(campaign.target_conversions),
    target_mrr: String(campaign.target_mrr),
  });
  const [deleting, setDeleting] = useState(false);
  const save = async () => {
    const { error } = await supabase.from("sales_campaigns").update({
      ...form,
      budget: Number(form.budget) || 0,
      churn_rate: form.churn_rate === "" ? null : Number(form.churn_rate),
      priority: Number(form.priority) || 0,
      target_contacted: Number(form.target_contacted) || 0,
      target_replies: Number(form.target_replies) || 0,
      target_conversions: Number(form.target_conversions) || 0,
      target_mrr: Number(form.target_mrr) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      segment: form.segment || null,
      area: form.area || null,
      description: form.description || null,
    }).eq("id", campaign.id);

    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Campanha atualizada" });
    onSaved();
  };

  const deleteCampaign = async () => {
    setDeleting(true);
    const { error } = await supabase.from("sales_campaigns").delete().eq("id", campaign.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Campanha excluída" });
    qc.invalidateQueries({ queryKey: ["sales-campaigns"] });
    navigate("/sales-campaigns");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Configuração</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Canal</Label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Segmento</Label><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} /></div>
            <div><Label>Área</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex.: Vendas, CS, Parcerias" /></div>
            <div><Label>Investimento (R$)</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            <div><Label>Churn mensal (%)</Label><Input type="number" step="0.1" value={form.churn_rate} onChange={(e) => setForm({ ...form, churn_rate: e.target.value })} placeholder="Ex.: 5 (vazio = usa padrão financeiro)" /></div>
            <div><Label>Prioridade</Label><Input type="number" min="0" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} placeholder="1 = mais urgente (0 = sem prioridade)" /></div>
            <div><Label>Início</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>Término</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div><Label>Meta contatados</Label><Input type="number" value={form.target_contacted} onChange={(e) => setForm({ ...form, target_contacted: e.target.value })} /></div>
            <div><Label>Meta respostas</Label><Input type="number" value={form.target_replies} onChange={(e) => setForm({ ...form, target_replies: e.target.value })} /></div>
            <div><Label>Meta conversões</Label><Input type="number" value={form.target_conversions} onChange={(e) => setForm({ ...form, target_conversions: e.target.value })} /></div>
            <div><Label>Meta MRR</Label><Input type="number" value={form.target_mrr} onChange={(e) => setForm({ ...form, target_mrr: e.target.value })} /></div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={save}><Save className="h-4 w-4 mr-1" />Salvar</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de perigo</CardTitle>
          <CardDescription>Excluir a campanha remove todos os contatos, snapshots e histórico de importação.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir campanha</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                <AlertDialogDescription>
                  Essa ação não pode ser desfeita. Todos os contatos, snapshots e registros desta campanha serão removidos permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={deleteCampaign} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
                  {deleting ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
