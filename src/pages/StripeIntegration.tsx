import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Copy, CheckCircle2, XCircle, AlertCircle, ExternalLink,
  RefreshCw, Activity, Clock, Zap, LifeBuoy,
} from "lucide-react";
import { MapStripePriceButton } from "@/components/MapStripePriceButton";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const WEBHOOK_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/stripe-webhook`;

const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "invoice.paid",
];

interface ConnectionInfo {
  ok: boolean;
  account?: {
    id: string;
    email: string | null;
    country: string | null;
    business_profile: string | null;
    charges_enabled: boolean;
    mode: "live" | "test";
  };
  webhook_secret_configured?: boolean;
  error?: string;
}

interface Counts {
  totalEvents: number;
  totalConversions: number;
  conversionsLast30: number;
  mrrLast30: number;
  unmappedPrices: number;
}

interface Freshness {
  lastEventAt: string | null;
  lastConversionAt: string | null;
  lastSyncAt: string | null;
}

interface RecentEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  result: string | null;
  processed_at: string;
  payload: any;
}

interface RecentConversion {
  id: string;
  customer_email: string | null;
  area: string;
  product_name: string | null;
  plan_name: string | null;
  mrr: number;
  converted_at: string | null;
  registered_at: string | null;
  stripe_price_id: string | null;
}

interface UnmappedPrice {
  id: string;
  price_id: string;
  count: number;
  last_seen: string;
  sample_email: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "agora";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function freshnessTone(iso: string | null, warnHours = 6, errHours = 24): "ok" | "warn" | "err" {
  if (!iso) return "err";
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours < warnHours) return "ok";
  if (hours < errHours) return "warn";
  return "err";
}

const RESULT_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  conversion_recorded: { label: "Conversão registrada", tone: "ok" },
  duplicate_subscription: { label: "Duplicado", tone: "muted" },
  no_email: { label: "Sem email", tone: "warn" },
  conversion_failed: { label: "Falha ao gravar", tone: "err" },
  extraction_failed: { label: "Falha na leitura", tone: "err" },
  ignored_event_type: { label: "Ignorado", tone: "muted" },
  discarded_no_price: { label: "Descartado: sem price", tone: "muted" },
  discarded_zero_mrr: { label: "Descartado: MRR zero", tone: "muted" },
};

export default function StripeIntegration() {
  const { role } = useAuth();
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverDays, setRecoverDays] = useState<number>(60);
  const [recovering, setRecovering] = useState(false);
  const [recoverElapsed, setRecoverElapsed] = useState(0);
  const [recoverResult, setRecoverResult] = useState<any>(null);
  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [counts, setCounts] = useState<Counts>({
    totalEvents: 0,
    totalConversions: 0,
    conversionsLast30: 0,
    mrrLast30: 0,
    unmappedPrices: 0,
  });
  const [freshness, setFreshness] = useState<Freshness>({ lastEventAt: null, lastConversionAt: null, lastSyncAt: null });
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [recentConversions, setRecentConversions] = useState<RecentConversion[]>([]);
  const [showTechLog, setShowTechLog] = useState(false);
  const [eventsByDay, setEventsByDay] = useState<{ day: string; count: number }[]>([]);
  const [eventsByType, setEventsByType] = useState<{ type: string; count: number }[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedPrice[]>([]);
  const [loading, setLoading] = useState(true);

  if (role !== "admin") return <Navigate to="/" replace />;

  async function loadAll() {
    setLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      totalEvtRes, totalConvRes, last30Res,
      lastEventRes, lastConvRes, settingsRes,
      recentRes, last7Res, unmappedRes, recentConvRes,
    ] = await Promise.all([
      supabase.from("stripe_events").select("id", { count: "exact", head: true }),
      supabase.from("stripe_conversions").select("id", { count: "exact", head: true }),
      supabase.from("stripe_conversions").select("mrr").gte("converted_at", thirtyDaysAgo),
      supabase.from("stripe_events").select("processed_at").order("processed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("stripe_conversions").select("converted_at").order("converted_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("integration_settings").select("last_full_sync_at").limit(1).maybeSingle(),
      supabase.from("stripe_events").select("id, stripe_event_id, event_type, result, processed_at, payload").order("processed_at", { ascending: false }).limit(10),
      supabase.from("stripe_events").select("event_type, processed_at").gte("processed_at", sevenDaysAgo),
      supabase.from("integration_sync_errors")
        .select("id, ac_id, error_message, created_at, payload")
        .eq("entity_type", "stripe_unmapped_price")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("stripe_conversions")
        .select("id, customer_email, area, product_name, plan_name, mrr, converted_at, registered_at, stripe_price_id")
        .order("converted_at", { ascending: false, nullsFirst: false })
        .limit(15),
    ]);

    const last30Rows = (last30Res.data as { mrr: number }[]) || [];
    const mrrLast30 = last30Rows.reduce((s, r) => s + Number(r.mrr || 0), 0);

    // Agrega unmapped prices por price_id
    const unmappedRows = (unmappedRes.data as any[]) || [];
    const byPrice = new Map<string, UnmappedPrice>();
    for (const r of unmappedRows) {
      const pid = (r.ac_id as string) || (r.payload?.price_id as string) || "—";
      const cur = byPrice.get(pid);
      if (cur) {
        cur.count += 1;
        if (r.created_at > cur.last_seen) cur.last_seen = r.created_at;
      } else {
        byPrice.set(pid, {
          id: r.id,
          price_id: pid,
          count: 1,
          last_seen: r.created_at,
          sample_email: r.payload?.email ?? null,
        });
      }
    }
    const unmappedList = Array.from(byPrice.values()).sort((a, b) => b.count - a.count);

    setCounts({
      totalEvents: totalEvtRes.count || 0,
      totalConversions: totalConvRes.count || 0,
      conversionsLast30: last30Rows.length,
      mrrLast30,
      unmappedPrices: byPrice.size,
    });
    setFreshness({
      lastEventAt: (lastEventRes.data as any)?.processed_at ?? null,
      lastConversionAt: (lastConvRes.data as any)?.converted_at ?? null,
      lastSyncAt: (settingsRes.data as any)?.last_full_sync_at ?? null,
    });
    setRecentEvents((recentRes.data as RecentEvent[]) || []);
    setRecentConversions((recentConvRes.data as RecentConversion[]) || []);
    setUnmapped(unmappedList);

    // Aggregate last 7 days
    const byDay = new Map<string, number>();
    const byType = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const ev of (last7Res.data as any[]) || []) {
      const day = (ev.processed_at as string).slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
      byType.set(ev.event_type, (byType.get(ev.event_type) || 0) + 1);
    }
    setEventsByDay(Array.from(byDay.entries()).map(([day, count]) => ({ day, count })));
    setEventsByType(Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })));

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    handleTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTest() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-test-connection");
      if (error) throw error;
      setConn(data as ConnectionInfo);
    } catch (e: any) {
      setConn({ ok: false, error: e.message });
    }
    setTesting(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-sync-recent", { body: { hours: 24 } });
      if (error) throw error;
      const d = data as any;
      toast.success(`Sync concluído: ${d?.processed ?? 0} novos, ${d?.alreadyDone ?? 0} já existentes`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro ao sincronizar");
    }
    setSyncing(false);
  }

  async function handleBackfillDates() {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-backfill-dates", { body: { limit: 1000 } });
      if (error) throw error;
      const d = data as any;
      toast.success(`Datas recalculadas: ${d?.updated ?? 0} atualizadas, ${d?.failed ?? 0} falhas`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro ao recalcular datas");
    }
    setBackfilling(false);
  }

  async function handleRecover() {
    setRecovering(true);
    setRecoverResult(null);
    setRecoverElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRecoverElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-recover", { body: { days: recoverDays } });
      if (error) throw error;
      setRecoverResult(data);
      const d = data as any;
      toast.success(`Recuperação concluída: ${d?.inserted ?? 0} registradas, ${d?.skipped ?? 0} já existentes, ${d?.unmapped ?? 0} sem mapa, ${d?.failed ?? 0} falhas`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro ao recuperar conversões");
      setRecoverResult({ error: e.message });
    } finally {
      clearInterval(timer);
      setRecovering(false);
    }
  }

  // Estimativa: ~150 subs/dia em média, ~0.8s por sub processada
  const estimatedSeconds = Math.max(20, Math.round(recoverDays * 1.5));
  const recoverProgress = recovering
    ? Math.min(95, Math.round((recoverElapsed / estimatedSeconds) * 100))
    : recoverResult ? 100 : 0;

  function copyWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("URL copiada");
  }

  // Health summary
  const health = useMemo(() => {
    const eventTone = freshnessTone(freshness.lastEventAt);
    const issues: string[] = [];
    if (!conn?.ok) issues.push("Conexão Stripe falhou");
    if (conn?.ok && !conn.webhook_secret_configured) issues.push("Webhook secret não configurado");
    if (eventTone === "err") issues.push("Nenhum evento recente (>24h)");
    else if (eventTone === "warn") issues.push("Eventos atrasados (>6h)");
    if (counts.unmappedPrices > 0) issues.push(`${counts.unmappedPrices} price_id(s) fora do Mapa de Preços`);
    let status: "ok" | "warn" | "err" = "ok";
    if (!conn?.ok || eventTone === "err") status = "err";
    else if (issues.length > 0) status = "warn";
    return { status, issues };
  }, [conn, freshness.lastEventAt, counts.unmappedPrices]);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


  const maxDay = Math.max(1, ...eventsByDay.map((d) => d.count));

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-5xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-heading font-bold">Integração Stripe</h1>
            <p className="text-muted-foreground mt-1">
              Recebe assinaturas pagas em tempo real e alimenta o painel <strong>Conversões por Área</strong> cruzando o <code className="font-mono text-xs">price_id</code> com o Mapa de Preços.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => { setRecoverResult(null); setRecoverOpen(true); }} variant="default" size="sm" title="Varre assinaturas direto na Stripe e grava conversões que faltam">
              <LifeBuoy className="h-4 w-4 mr-2" />
              Recuperar conversões
            </Button>
            <Button onClick={handleBackfillDates} disabled={backfilling} variant="outline" size="sm" title="Recalcula registered_at e converted_at de todas as conversões usando dados do Stripe">
              {backfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Recalcular datas
            </Button>
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
            <Button onClick={() => { loadAll(); handleTest(); }} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Dialog Recuperar conversões */}
        <Dialog open={recoverOpen} onOpenChange={(o) => { if (!recovering) setRecoverOpen(o); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><LifeBuoy className="h-5 w-5" /> Recuperar conversões perdidas</DialogTitle>
              <DialogDescription>
                Pagina assinaturas direto da API do Stripe no período selecionado, cruza com o Mapa de Preços e grava em <code className="font-mono text-xs">stripe_conversions</code>. Útil para reconciliar períodos em que o webhook usou regras antigas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Janela retroativa</label>
                <Select value={String(recoverDays)} onValueChange={(v) => setRecoverDays(Number(v))} disabled={recovering}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="60">Últimos 60 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                    <SelectItem value="180">Últimos 180 dias</SelectItem>
                    <SelectItem value="365">Último ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(recovering || recoverResult) && (
                <div className="space-y-2">
                  <Progress value={recoverProgress} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {recovering ? (
                        <><Loader2 className="h-3 w-3 mr-1 inline animate-spin" /> Processando…</>
                      ) : recoverResult?.error ? (
                        <span className="text-destructive">Falhou</span>
                      ) : (
                        <><CheckCircle2 className="h-3 w-3 mr-1 inline text-success" /> Concluído</>
                      )}
                    </span>
                    <span className="font-mono">
                      {Math.floor(recoverElapsed / 60).toString().padStart(2, "0")}:{(recoverElapsed % 60).toString().padStart(2, "0")}
                      {recovering && <> / ~{Math.floor(estimatedSeconds / 60).toString().padStart(2, "0")}:{(estimatedSeconds % 60).toString().padStart(2, "0")}</>}
                    </span>
                  </div>
                </div>
              )}

              {recoverResult && !recoverResult.error && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Assinaturas varridas</div><div className="font-heading font-semibold">{recoverResult.scanned ?? 0}</div></div>
                  <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Conversões gravadas</div><div className="font-heading font-semibold text-primary">{recoverResult.inserted ?? 0}</div></div>
                  <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Já existentes</div><div className="font-heading font-semibold">{recoverResult.skipped ?? 0}</div></div>
                  <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Sem mapa de preço</div><div className={"font-heading font-semibold " + ((recoverResult.unmapped ?? 0) > 0 ? "text-warning" : "")}>{recoverResult.unmapped ?? 0}</div></div>
                  {(recoverResult.failed ?? 0) > 0 && (
                    <div className="rounded-md border p-2 col-span-2"><div className="text-xs text-muted-foreground">Falhas</div><div className="font-heading font-semibold text-destructive">{recoverResult.failed}</div></div>
                  )}
                </div>
              )}

              {recoverResult?.error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{recoverResult.error}</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecoverOpen(false)} disabled={recovering}>Fechar</Button>
              <Button onClick={handleRecover} disabled={recovering}>
                {recovering ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recuperando…</> : <><LifeBuoy className="h-4 w-4 mr-2" /> Iniciar recuperação</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Health banner */}
        <Card className={
          health.status === "ok" ? "border-success/40 bg-success/5"
          : health.status === "warn" ? "border-warning/40 bg-warning/5"
          : "border-destructive/40 bg-destructive/5"
        }>
          <CardContent className="pt-6 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={
                "h-3 w-3 rounded-full " +
                (health.status === "ok" ? "bg-success"
                  : health.status === "warn" ? "bg-warning"
                  : "bg-destructive")
              } />
              <div>
                <p className="font-heading font-semibold">
                  {health.status === "ok" ? "Integração saudável"
                    : health.status === "warn" ? "Atenção"
                    : "Problemas detectados"}
                </p>
                {health.issues.length > 0 && (
                  <p className="text-xs text-muted-foreground">{health.issues.join(" • ")}</p>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              {testing ? (
                <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Testando…</Badge>
              ) : conn?.account ? (
                <Badge variant={conn.account.mode === "live" ? "default" : "secondary"}>
                  {conn.account.mode === "live" ? "Modo LIVE" : "Modo TESTE"}
                </Badge>
              ) : null}
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Último evento: {formatRelative(freshness.lastEventAt)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Status counters — foco em conversões registradas para o painel "Conversões por Área" */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Conversões (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-primary">{counts.conversionsLast30}</div>
              <p className="text-xs text-muted-foreground mt-1">novas assinaturas pagas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">MRR (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-success">{fmtBRL(counts.mrrLast30)}</div>
              <p className="text-xs text-muted-foreground mt-1">somado pelo Mapa de Preços</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Conversões (total)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold">{counts.totalConversions}</div>
              <p className="text-xs text-muted-foreground mt-1">{counts.totalEvents} eventos recebidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Preços não mapeados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={"text-3xl font-heading font-bold " + (counts.unmappedPrices > 0 ? "text-warning" : "text-success")}>
                {counts.unmappedPrices}
              </div>
              <p className="text-xs text-muted-foreground mt-1">price_id sem entrada no Mapa</p>
            </CardContent>
          </Card>
        </div>


        {/* Última atualização */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Última atualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              {[
                { label: "Último evento recebido", iso: freshness.lastEventAt },
                { label: "Último 1º pagamento registrado", iso: freshness.lastConversionAt },
                { label: "Último sync manual", iso: freshness.lastSyncAt, warnHours: 48, errHours: 168 },
              ].map((f) => {
                const tone = freshnessTone(f.iso, f.warnHours, f.errHours);
                return (
                  <div key={f.label} className="rounded-md border p-3 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{f.label}</p>
                    <p className="font-heading text-lg font-semibold">{formatRelative(f.iso)}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{formatDateTime(f.iso)}</span>
                      <span className={
                        "h-2 w-2 rounded-full " +
                        (tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-destructive")
                      } />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Atividade últimos 7 dias */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Atividade nos últimos 7 dias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2 h-32">
              {eventsByDay.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs font-medium">{d.count}</div>
                  <div
                    className="w-full bg-primary/80 rounded-t transition-all"
                    style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? "4px" : "2px" }}
                  />
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
            {eventsByType.length > 0 && (
              <div className="border-t pt-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Por tipo de evento</p>
                {eventsByType.map((t) => (
                  <div key={t.type} className="flex items-center justify-between text-sm">
                    <code className="font-mono text-xs">{t.type}</code>
                    <Badge variant="outline">{t.count}</Badge>
                  </div>
                ))}
              </div>
            )}
            {eventsByType.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento nos últimos 7 dias.</p>
            )}
          </CardContent>
        </Card>

        {/* Últimas conversões registradas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas conversões registradas</CardTitle>
            <CardDescription>
              Conversões gravadas em <code>stripe_conversions</code>, ordenadas pelo 1º pagamento confirmado no Stripe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentConversions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conversão registrada.</p>
            ) : (
              <div className="space-y-1">
                {recentConversions.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">
                      {formatDateTime(c.converted_at)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{c.customer_email || "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.product_name || c.plan_name || c.stripe_price_id || "—"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={c.area === "desconhecida" ? "border-warning/40 text-warning" : ""}
                    >
                      {c.area}
                    </Badge>
                    <span className="text-xs font-medium w-24 text-right shrink-0">
                      R$ {Number(c.mrr || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {c.area === "desconhecida" && c.stripe_price_id && (
                      <MapStripePriceButton
                        price_id={c.stripe_price_id}
                        offer_name={c.product_name}
                        customer_email={c.customer_email}
                        mrr={c.mrr}
                        onMapped={loadAll}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Log técnico do webhook (colapsado) */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowTechLog((v) => !v)}>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Log técnico do webhook</span>
              <Badge variant="outline" className="text-xs">{showTechLog ? "ocultar" : "mostrar"}</Badge>
            </CardTitle>
            <CardDescription>
              Últimos 10 eventos recebidos no endpoint <code>stripe-webhook</code>. Cobranças recorrentes são filtradas.
            </CardDescription>
          </CardHeader>
          {showTechLog && (
            <CardContent>
              {(() => {
                const filtered = recentEvents.filter((ev) => !(ev.result || "").startsWith("ignored_recurring"));
                if (filtered.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-6">Sem eventos relevantes.</p>;
                }
                return (
                  <div className="space-y-1">
                    {filtered.map((ev) => {
                      const r = RESULT_LABELS[ev.result || ""] || { label: ev.result || "—", tone: "muted" as const };
                      const email = ev.payload?.data?.object?.customer_email
                        || ev.payload?.data?.object?.customer_details?.email
                        || ev.payload?.data?.object?.receipt_email
                        || null;
                      return (
                        <div key={ev.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0">
                          <span className="text-xs text-muted-foreground w-28 shrink-0">
                            {formatDateTime(ev.processed_at)}
                          </span>
                          <code className="font-mono text-xs flex-1 truncate">{ev.event_type}</code>
                          <span className="text-xs text-muted-foreground flex-1 truncate hidden md:inline">{email || "—"}</span>
                          <Badge
                            variant="outline"
                            className={
                              r.tone === "ok" ? "border-success/40 text-success"
                              : r.tone === "warn" ? "border-warning/40 text-warning"
                              : r.tone === "err" ? "border-destructive/40 text-destructive"
                              : ""
                            }
                          >
                            {r.label}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          )}
        </Card>

        {/* Preços do Stripe sem entrada no Mapa de Preços */}
        {unmapped.length > 0 && (
          <Card className="border-warning/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <AlertCircle className="h-4 w-4" /> Preços fora do Mapa ({unmapped.length})
              </CardTitle>
              <CardDescription>
                Esses <code className="font-mono">price_id</code> chegaram do Stripe mas não têm correspondência em <strong>Comissionamento › Mapa de Preços</strong>, então caem como <code>desconhecida</code> no gráfico de Conversões por Área. Cadastre-os no Mapa para classificá-los.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unmapped.slice(0, 20).map((u) => (
                <div key={u.price_id} className="flex items-center gap-3 text-sm border rounded-md p-2">
                  <div className="flex-1 min-w-0">
                    <code className="font-mono text-xs truncate block">{u.price_id}</code>
                    {u.sample_email && (
                      <p className="text-xs text-muted-foreground truncate">último: {u.sample_email}</p>
                    )}
                  </div>
                  <Badge variant="outline">{u.count}× </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelative(u.last_seen)}
                  </span>
                  <MapStripePriceButton
                    price_id={u.price_id}
                    customer_email={u.sample_email}
                    onMapped={loadAll}
                  />
                </div>
              ))}
              {unmapped.length > 20 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  +{unmapped.length - 20} preço(s) adicionais não exibidos.
                </p>
              )}
            </CardContent>
          </Card>
        )}


        {/* Credentials detail (collapsed-ish) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciais</CardTitle>
            <CardDescription>
              A chave secreta do Stripe está armazenada de forma segura nos secrets da aplicação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleTest} disabled={testing} variant="outline">
              {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Testar conexão
            </Button>

            {conn && conn.ok && conn.account && (
              <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="font-medium text-sm">Conexão ativa</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Conta: </span>
                    <span className="font-mono text-xs">{conn.account.id}</span>
                  </div>
                  {conn.account.business_profile && (
                    <div>
                      <span className="text-muted-foreground">Empresa: </span>
                      <span>{conn.account.business_profile}</span>
                    </div>
                  )}
                  {conn.account.email && (
                    <div>
                      <span className="text-muted-foreground">Email: </span>
                      <span>{conn.account.email}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">País: </span>
                    <span>{conn.account.country || "—"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t text-sm">
                  {conn.webhook_secret_configured ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span>Webhook secret configurado</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <span className="text-warning">Webhook secret não configurado — eventos sem validação</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {conn && !conn.ok && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">Falha ao conectar</p>
                  <p className="text-muted-foreground mt-1">{conn.error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Webhook setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuração do webhook no Stripe</CardTitle>
            <CardDescription>
              No painel do Stripe, vá em Developers → Webhooks → Add endpoint e cole a URL abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">URL do endpoint</p>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 rounded-md border bg-muted font-mono text-xs break-all">
                  {WEBHOOK_URL}
                </code>
                <Button onClick={copyWebhook} variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Eventos a habilitar</p>
              <div className="flex flex-wrap gap-2">
                {REQUIRED_EVENTS.map((e) => (
                  <Badge key={e} variant="outline" className="font-mono text-xs">{e}</Badge>
                ))}
              </div>
            </div>

            <a
              href="https://dashboard.stripe.com/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
            >
              Abrir Stripe Dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
