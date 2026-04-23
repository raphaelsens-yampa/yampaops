import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2, XCircle, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

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
  pending: number;
  noMatch: number;
  totalEvents: number;
  matched: number;
}

export default function StripeIntegration() {
  const { role } = useAuth();
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [counts, setCounts] = useState<Counts>({ pending: 0, noMatch: 0, totalEvents: 0, matched: 0 });
  const [loading, setLoading] = useState(true);

  if (role !== "admin") return <Navigate to="/" replace />;

  async function loadCounts() {
    const [pendingRes, noMatchRes, totalRes, matchedRes] = await Promise.all([
      supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("stage", "pendencias_stripe"),
      supabase.from("integration_sync_errors").select("id", { count: "exact", head: true }).eq("entity_type", "stripe_no_match").eq("resolved", false),
      supabase.from("stripe_events").select("id", { count: "exact", head: true }),
      supabase.from("stripe_events").select("id", { count: "exact", head: true }).eq("result", "matched_pending"),
    ]);
    setCounts({
      pending: pendingRes.count || 0,
      noMatch: noMatchRes.count || 0,
      totalEvents: totalRes.count || 0,
      matched: matchedRes.count || 0,
    });
    setLoading(false);
  }

  useEffect(() => { loadCounts(); }, []);

  async function handleTest() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-test-connection");
      if (error) throw error;
      setConn(data as ConnectionInfo);
      if (data?.ok) toast.success("Conexão Stripe validada");
      else toast.error(data?.error || "Falha ao conectar");
    } catch (e: any) {
      toast.error(e.message || "Erro ao testar conexão");
      setConn({ ok: false, error: e.message });
    }
    setTesting(false);
  }

  function copyWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("URL copiada");
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold">Integração Stripe</h1>
            <p className="text-muted-foreground mt-1">
              Receba assinaturas pagas em tempo real e concilie com os deals do pipeline.
            </p>
          </div>
          <Button onClick={loadCounts} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

        {/* Status counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-warning">{counts.pending}</div>
              <p className="text-xs text-muted-foreground mt-1">aguardando aprovação</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Não casados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-destructive">{counts.noMatch}</div>
              <p className="text-xs text-muted-foreground mt-1">emails sem deal correspondente</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Conciliados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-success">{counts.matched}</div>
              <p className="text-xs text-muted-foreground mt-1">eventos processados com sucesso</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total eventos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-primary">{counts.totalEvents}</div>
              <p className="text-xs text-muted-foreground mt-1">recebidos do Stripe</p>
            </CardContent>
          </Card>
        </div>

        {/* Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciais</CardTitle>
            <CardDescription>
              A chave secreta do Stripe está armazenada de forma segura nos secrets da aplicação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleTest} disabled={testing}>
              {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Testar conexão
            </Button>

            {conn && conn.ok && conn.account && (
              <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="font-medium text-sm">Conexão ativa</span>
                  <Badge variant={conn.account.mode === "live" ? "default" : "secondary"} className="ml-auto">
                    {conn.account.mode === "live" ? "Modo LIVE" : "Modo TESTE"}
                  </Badge>
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

            <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
              <p className="font-medium">Após criar o endpoint:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>O Stripe mostrará um <strong>Signing secret</strong> começando com <code className="font-mono text-xs">whsec_</code></li>
                <li>Copie esse valor e me envie no chat — eu vou cadastrar como <code className="font-mono text-xs">STRIPE_WEBHOOK_SECRET</code></li>
                <li>A partir daí, todo pagamento confirmado vai automaticamente para a coluna "Pendências Stripe" no pipeline padrão</li>
              </ol>
              <a
                href="https://dashboard.stripe.com/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-2"
              >
                Abrir Stripe Dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
