import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, MessageCircle, ExternalLink,
} from "lucide-react";
import { ChatwootContactsCard } from "@/components/chatwoot/ChatwootContactsCard";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const WEBHOOK_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/chatwoot-webhook`;

type Settings = {
  id: string;
  chatwoot_base_url: string | null;
  chatwoot_account_id: number | null;
  chatwoot_last_event_at: string | null;
};

type Conversation = {
  chatwoot_conversation_id: number;
  status: string;
  tabulacao_atendimento: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  last_message_at: string | null;
};

type SyncError = {
  id: string;
  entity_type: string;
  ac_id: string | null;
  error_message: string;
  created_at: string;
};

export default function ChatwootIntegration() {
  const { role } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [accountId, setAccountId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [cwUserName, setCwUserName] = useState("");

  if (role !== "admin") return <Navigate to="/" replace />;

  async function loadAll() {
    const [s, c, e] = await Promise.all([
      supabase.from("integration_settings").select("id, chatwoot_base_url, chatwoot_account_id, chatwoot_last_event_at").maybeSingle(),
      supabase.from("chatwoot_conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(20),
      supabase.from("integration_sync_errors").select("*").like("entity_type", "chatwoot_%").order("created_at", { ascending: false }).limit(10),
    ]);
    if (s.data) {
      setSettings(s.data as Settings);
      setBaseUrl(s.data.chatwoot_base_url || "");
      setAccountId(s.data.chatwoot_account_id ? String(s.data.chatwoot_account_id) : "");
    }
    if (c.data) setConversations(c.data as Conversation[]);
    if (e.data) setErrors(e.data as SyncError[]);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleTest() {
    if (!baseUrl || !accountId) {
      toast.error("Preencha URL base e Account ID");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatwoot-test-connection", {
        body: { base_url: baseUrl.replace(/\/$/, ""), account_id: Number(accountId) },
      });
      if (error) throw error;
      if (data?.ok) {
        setConnected(true);
        setCwUserName(data.user?.name || data.user?.email || "");
        toast.success("Conexão validada com Chatwoot");
        await loadAll();
      } else {
        setConnected(false);
        toast.error(`Falha: ${data?.error || "credenciais inválidas"}`);
      }
    } catch (e: any) {
      setConnected(false);
      toast.error(e.message || "Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("URL do webhook copiada");
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold">Integração Chatwoot</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Sincronização one-way Chatwoot → Yampa via webhook (matching email → telefone)</p>
          </div>
        </div>

        {/* 1. Credenciais */}
        <Card>
          <CardHeader>
            <CardTitle>1. Credenciais</CardTitle>
            <CardDescription>Token armazenado em CHATWOOT_API_TOKEN. Configure URL base e Account ID abaixo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">URL base</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://app.chatwoot.com"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Account ID</Label>
                <Input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="1"
                  inputMode="numeric"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar conexão
              </Button>
              {connected === true && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Conectado {cwUserName && `como ${cwUserName}`}
                </Badge>
              )}
              {connected === false && (
                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>
              )}
              {settings?.chatwoot_last_event_at && (
                <span className="text-xs text-muted-foreground">
                  Último evento: {new Date(settings.chatwoot_last_event_at).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Webhook */}
        <Card>
          <CardHeader>
            <CardTitle>2. Webhook</CardTitle>
            <CardDescription>Cole esta URL no Chatwoot em Settings → Integrations → Webhooks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
              <Button onClick={copyWebhook} variant="outline" size="icon"><Copy className="h-4 w-4" /></Button>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Eventos a marcar:</p>
              <ul className="list-disc list-inside ml-2 text-xs space-y-0.5">
                <li><code className="font-mono">conversation_created</code></li>
                <li><code className="font-mono">conversation_updated</code></li>
                <li><code className="font-mono">conversation_status_changed</code></li>
                <li><code className="font-mono">message_created</code></li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* 3. Atributo personalizado */}
        <Card>
          <CardHeader>
            <CardTitle>3. Atributo personalizado</CardTitle>
            <CardDescription>Necessário para trazer a tabulação do atendimento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              Crie no Chatwoot um <strong>Conversation Custom Attribute</strong> com a chave{" "}
              <code className="font-mono px-1 py-0.5 bg-muted rounded text-xs">tabulacao_atendimento</code>.
              Esse valor será sincronizado em cada conversa.
            </p>
            <a
              href="https://www.chatwoot.com/docs/product/others/custom-attributes"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Documentação oficial <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>

        {/* 4. Conversas recentes */}
        <Card>
          <CardHeader>
            <CardTitle>4. Conversas recentes ({conversations.length})</CardTitle>
            <CardDescription>Últimas 20 conversas sincronizadas</CardDescription>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conversa recebida ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conv #</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tabulação</TableHead>
                      <TableHead>Vínculo</TableHead>
                      <TableHead>Última msg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations.map((c) => (
                      <TableRow key={c.chatwoot_conversation_id}>
                        <TableCell className="font-mono text-xs">{c.chatwoot_conversation_id}</TableCell>
                        <TableCell className="text-sm">{c.contact_email || c.contact_phone || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "resolved" ? "secondary" : "default"} className="text-xs">
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{c.tabulacao_atendimento || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {c.opportunity_id ? (
                            <Badge variant="outline">Deal</Badge>
                          ) : c.contact_id ? (
                            <Badge variant="outline">Só contato</Badge>
                          ) : (
                            <Badge variant="secondary">Sem match</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5. Contatos do Chatwoot */}
        <ChatwootContactsCard />

        {/* Erros */}
        {errors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Erros recentes ({errors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><Badge variant="outline" className="text-xs">{e.entity_type}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.ac_id || "—"}</TableCell>
                      <TableCell className="text-sm">{e.error_message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
