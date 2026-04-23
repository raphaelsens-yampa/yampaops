import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, RefreshCw, PlayCircle, Copy, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type AcPipeline = {
  ac_pipeline_id: string;
  ac_pipeline_title: string;
  is_selected: boolean;
  deals_count: number | null;
  last_synced_at: string | null;
  local_pipeline_id: string | null;
};

type SyncError = {
  id: string;
  entity_type: string;
  ac_id: string | null;
  error_message: string;
  created_at: string;
  resolved: boolean;
};

type IntegrationSettings = {
  id: string;
  ac_account_url: string | null;
  last_full_sync_at: string | null;
  sync_status: string | null;
  sync_log: any;
};

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const WEBHOOK_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/ac-webhook`;

export default function ActiveCampaignIntegration() {
  const { role } = useAuth();
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [pipelines, setPipelines] = useState<AcPipeline[]>([]);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [testing, setTesting] = useState(false);
  const [listing, setListing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [acUserName, setAcUserName] = useState<string>("");

  if (role !== "admin") return <Navigate to="/" replace />;

  async function loadAll() {
    const [s, p, e] = await Promise.all([
      supabase.from("integration_settings").select("*").maybeSingle(),
      supabase.from("ac_pipeline_selection").select("*").order("ac_pipeline_title"),
      supabase.from("integration_sync_errors").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(20),
    ]);
    if (s.data) setSettings(s.data as IntegrationSettings);
    if (p.data) setPipelines(p.data as AcPipeline[]);
    if (e.data) setErrors(e.data as SyncError[]);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleTest() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-test-connection");
      if (error) throw error;
      if (data?.ok) {
        setConnected(true);
        setAcUserName(data.user?.username || data.user?.email || "");
        toast.success("Conexão validada com ActiveCampaign");
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

  async function handleListPipelines() {
    setListing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-list-pipelines");
      if (error) throw error;
      toast.success(`${data?.count ?? 0} pipelines carregados do ActiveCampaign`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro ao listar pipelines");
    } finally {
      setListing(false);
    }
  }

  function toggleSelection(id: string, value: boolean) {
    setPipelines((prev) => prev.map((p) => (p.ac_pipeline_id === id ? { ...p, is_selected: value } : p)));
  }

  async function handleSaveSelection() {
    setSaving(true);
    try {
      const updates = pipelines.map((p) =>
        supabase.from("ac_pipeline_selection").update({ is_selected: p.is_selected }).eq("ac_pipeline_id", p.ac_pipeline_id),
      );
      await Promise.all(updates);
      toast.success("Seleção salva");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ac-sync-initial");
      if (error) throw error;
      const t = data?.totals || {};
      toast.success(`Sync concluído: ${t.dealsCount || 0} deals · ${t.contactsCount || 0} contatos · ${t.activitiesCount || 0} atividades`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro na sincronização");
    } finally {
      setSyncing(false);
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("URL do webhook copiada");
  }

  const selectedCount = pipelines.filter((p) => p.is_selected).length;

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="font-heading text-3xl font-bold">Integração ActiveCampaign</h1>
          <p className="text-muted-foreground mt-1">Sincronização one-way AC → Yampa filtrada por pipelines selecionados</p>
        </div>

        {/* 1. Credenciais */}
        <Card>
          <CardHeader>
            <CardTitle>1. Credenciais</CardTitle>
            <CardDescription>Valide as credenciais armazenadas (AC_API_URL e AC_API_KEY)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">URL da conta</Label>
              <Input value={settings?.ac_account_url || "Não validada ainda"} readOnly className="font-mono text-sm" />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar conexão
              </Button>
              {connected === true && (
                <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Conectado {acUserName && `como ${acUserName}`}</Badge>
              )}
              {connected === false && (
                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Seleção de Pipelines */}
        <Card>
          <CardHeader>
            <CardTitle>2. Seleção de Pipelines</CardTitle>
            <CardDescription>Marque quais pipelines do AC você quer sincronizar. Apenas deals e contatos desses pipelines virão para o Yampa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={handleListPipelines} disabled={listing} variant="outline">
                {listing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Buscar pipelines do ActiveCampaign
              </Button>
              {pipelines.length > 0 && (
                <Button onClick={handleSaveSelection} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar seleção ({selectedCount})
                </Button>
              )}
            </div>

            {pipelines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pipeline carregado ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Pipeline (AC)</TableHead>
                    <TableHead className="text-right">Deals</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Última sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelines.map((p) => (
                    <TableRow key={p.ac_pipeline_id}>
                      <TableCell>
                        <Checkbox checked={p.is_selected} onCheckedChange={(v) => toggleSelection(p.ac_pipeline_id, v === true)} />
                      </TableCell>
                      <TableCell className="font-medium">{p.ac_pipeline_title}</TableCell>
                      <TableCell className="text-right">{p.deals_count ?? 0}</TableCell>
                      <TableCell>
                        {p.local_pipeline_id ? (
                          <Badge variant="default">Sincronizado</Badge>
                        ) : p.is_selected ? (
                          <Badge variant="secondary">Pendente</Badge>
                        ) : (
                          <Badge variant="outline">Ignorado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 3. Sincronização */}
        <Card>
          <CardHeader>
            <CardTitle>3. Sincronização</CardTitle>
            <CardDescription>Roda a sync inicial (stages → deals → contatos → notas) para os pipelines marcados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button onClick={handleSync} disabled={syncing || selectedCount === 0}>
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Sincronizar agora ({selectedCount} pipelines)
              </Button>
              {settings?.sync_status && settings.sync_status !== "idle" && (
                <Badge variant="secondary">{settings.sync_status}</Badge>
              )}
            </div>

            {settings?.last_full_sync_at && (
              <div className="text-sm text-muted-foreground">
                <p>Última sincronização: {new Date(settings.last_full_sync_at).toLocaleString("pt-BR")}</p>
                {settings.sync_log?.totals && (
                  <p className="mt-1">
                    {settings.sync_log.totals.dealsCount || 0} deals · {settings.sync_log.totals.contactsCount || 0} contatos · {settings.sync_log.totals.activitiesCount || 0} atividades
                  </p>
                )}
              </div>
            )}

            <div className="border-t pt-4 mt-4">
              <Label className="font-semibold">URL do webhook (cole no ActiveCampaign)</Label>
              <p className="text-xs text-muted-foreground mb-2">Em AC: Settings → Developer → Manage Webhooks → Add. Eventos: contact_add, contact_update, deal_add, deal_update, deal_pipeline_add, deal_stage_add, deal_note_add, deal_task_add</p>
              <div className="flex gap-2">
                <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
                <Button onClick={copyWebhook} variant="outline" size="icon"><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Erros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Erros recentes ({errors.length})
            </CardTitle>
            <CardDescription>Últimos eventos que falharam. Verifique mapeamentos de e-mail e formatos.</CardDescription>
          </CardHeader>
          <CardContent>
            {errors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum erro pendente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>AC ID</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><Badge variant="outline">{e.entity_type}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.ac_id || "—"}</TableCell>
                      <TableCell className="text-sm">{e.error_message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
