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
import { Loader2, RefreshCw, ExternalLink, AlertCircle, Link2, CheckCircle2, XCircle, Activity, Trash2, RotateCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

type LinkRow = {
  id: string;
  chatwoot_conversation_id: number;
  ac_contact_id: string;
  ac_note_id: string;
  match_method: string;
  match_value: string | null;
  last_synced_at: string;
};

type ErrRow = {
  id: string;
  ac_id: string | null;
  error_message: string;
  created_at: string;
};

export default function ChatwootAcIntegration() {
  const { role } = useAuth();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [errors, setErrors] = useState<ErrRow[]>([]);
  const [stats, setStats] = useState<{ conversations: number; linked: number }>({ conversations: 0, linked: 0 });
  const [acBaseUrl, setAcBaseUrl] = useState<string>("");
  const [cwBaseUrl, setCwBaseUrl] = useState<string>("");
  const [cwAccount, setCwAccount] = useState<number | null>(null);

  const [backfillLimit, setBackfillLimit] = useState("100");
  const [backfilling, setBackfilling] = useState(false);
  const [singleId, setSingleId] = useState("");
  const [syncingOne, setSyncingOne] = useState(false);
  const [useEmail, setUseEmail] = useState(true);
  const [usePhone, setUsePhone] = useState(true);
  const [primaryEmailOnly, setPrimaryEmailOnly] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [clearingErrors, setClearingErrors] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastErrorAt, setLastErrorAt] = useState<string | null>(null);
  const [matchByEmail, setMatchByEmail] = useState(0);
  const [matchByPhone, setMatchByPhone] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);

  if (role !== "admin") return <Navigate to="/" replace />;

  async function loadAll() {
    setStatusLoading(true);
    const [l, e, sCount, lCount, s, emailCount, phoneCount, errCount, lastSync, lastErr] = await Promise.all([
      supabase.from("chatwoot_ac_note_links").select("*").order("last_synced_at", { ascending: false }).limit(30),
      supabase.from("integration_sync_errors").select("id, ac_id, error_message, created_at").eq("entity_type", "chatwoot_ac_note").order("created_at", { ascending: false }).limit(20),
      supabase.from("chatwoot_conversations").select("chatwoot_conversation_id", { count: "exact", head: true }),
      supabase.from("chatwoot_ac_note_links").select("id", { count: "exact", head: true }),
      supabase.from("integration_settings").select("chatwoot_base_url, chatwoot_account_id").maybeSingle(),
      supabase.from("chatwoot_ac_note_links").select("id", { count: "exact", head: true }).eq("match_method", "email"),
      supabase.from("chatwoot_ac_note_links").select("id", { count: "exact", head: true }).eq("match_method", "phone"),
      supabase.from("integration_sync_errors").select("id", { count: "exact", head: true }).eq("entity_type", "chatwoot_ac_note"),
      supabase.from("chatwoot_ac_note_links").select("last_synced_at").order("last_synced_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("integration_sync_errors").select("created_at").eq("entity_type", "chatwoot_ac_note").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (l.data) setLinks(l.data as LinkRow[]);
    if (e.data) setErrors(e.data as ErrRow[]);
    setStats({ conversations: sCount.count || 0, linked: lCount.count || 0 });
    setMatchByEmail(emailCount.count || 0);
    setMatchByPhone(phoneCount.count || 0);
    setTotalErrors(errCount.count || 0);
    setLastSyncAt((lastSync.data as any)?.last_synced_at || null);
    setLastErrorAt((lastErr.data as any)?.created_at || null);
    if (s.data) {
      setCwBaseUrl(s.data.chatwoot_base_url || "");
      setCwAccount(s.data.chatwoot_account_id || null);
      setAcBaseUrl("");
    }
    setStatusLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleBackfill() {
    const limit = Number(backfillLimit) || 100;
    if (!useEmail && !usePhone) { toast.error("Habilite ao menos email ou telefone"); return; }
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatwoot-ac-backfill", {
        body: { limit, use_email: useEmail, use_phone: usePhone, primary_email_only: primaryEmailOnly },
      });
      if (error) throw error;
      toast.success(`Backfill: ${data?.matched || 0} sincronizadas (email: ${data?.matched_by_email || 0} · fone: ${data?.matched_by_phone || 0}) · ${data?.no_match || 0} sem match · ${data?.failed || 0} falhas`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro no backfill");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleSyncOne() {
    const id = Number(singleId);
    if (!id) { toast.error("Informe um conversation_id"); return; }
    if (!useEmail && !usePhone) { toast.error("Habilite ao menos email ou telefone"); return; }
    setSyncingOne(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatwoot-to-ac-sync", {
        body: { conversation_id: id, use_email: useEmail, use_phone: usePhone, primary_email_only: primaryEmailOnly },
      });
      if (error) throw error;
      if (data?.ok) toast.success(`Sincronizado via ${data.match_method} (${data.match_value || "—"}) · contato AC ${data.ac_contact_id}`);
      else toast.warning(`Não sincronizado: ${data?.reason || "erro"}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setSyncingOne(false);
    }
  }

  async function handleRetryFailed() {
    setRetryingFailed(true);
    try {
      const { data: errs } = await supabase
        .from("integration_sync_errors")
        .select("ac_id")
        .eq("entity_type", "chatwoot_ac_note")
        .order("created_at", { ascending: false })
        .limit(50);
      const ids = Array.from(new Set((errs || []).map((r: any) => Number(r.ac_id)).filter((n) => Number.isFinite(n) && n > 0)));
      if (!ids.length) { toast.info("Nenhuma falha pendente"); return; }
      let ok = 0, fail = 0;
      for (const id of ids) {
        try {
          const { data } = await supabase.functions.invoke("chatwoot-to-ac-sync", {
            body: { conversation_id: id, use_email: useEmail, use_phone: usePhone, primary_email_only: primaryEmailOnly },
          });
          if (data?.ok) ok++; else fail++;
        } catch { fail++; }
        await new Promise((r) => setTimeout(r, 200));
      }
      toast.success(`Retry: ${ok} sincronizadas · ${fail} ainda falhando`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro no retry");
    } finally {
      setRetryingFailed(false);
    }
  }

  async function handleClearErrors() {
    if (!confirm("Limpar todos os logs de erro desta integração?")) return;
    setClearingErrors(true);
    try {
      const { error } = await supabase
        .from("integration_sync_errors")
        .delete()
        .eq("entity_type", "chatwoot_ac_note");
      if (error) throw error;
      toast.success("Logs de erro limpos");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Erro ao limpar");
    } finally {
      setClearingErrors(false);
    }
  }


  const cwLink = (convId: number) => cwBaseUrl && cwAccount
    ? `${cwBaseUrl.replace(/\/$/, "")}/app/accounts/${cwAccount}/conversations/${convId}`
    : null;

  const acLink = (contactId: string) => acBaseUrl
    ? `${acBaseUrl.replace(/\/$/, "").replace(/\/api\/3$/, "")}/app/contacts/${contactId}`
    : null;

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold">Chatwoot ↔ ActiveCampaign</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Anexa o link da conversa do Chatwoot no campo Notes do contato no ActiveCampaign (match por email → telefone).</p>
          </div>
        </div>

        {/* Status panel */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle>Status da integração</CardTitle>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={loadAll} disabled={statusLoading}>
                  {statusLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Recarregar
                </Button>
                <Button size="sm" variant="outline" onClick={handleRetryFailed} disabled={retryingFailed || totalErrors === 0}>
                  {retryingFailed ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1.5" />}
                  Re-tentar falhas
                </Button>
                <Button size="sm" variant="outline" onClick={handleClearErrors} disabled={clearingErrors || totalErrors === 0}>
                  {clearingErrors ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                  Limpar logs
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {cwBaseUrl && cwAccount ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  Chatwoot
                </div>
                <div className="mt-1 font-medium truncate">{cwBaseUrl ? "Configurado" : "Não configurado"}</div>
                {cwAccount && <div className="text-xs text-muted-foreground">conta #{cwAccount}</div>}
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ActiveCampaign
                </div>
                <div className="mt-1 font-medium">API configurada</div>
                <div className="text-xs text-muted-foreground">credenciais via secrets</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Última sync</div>
                <div className="mt-1 font-medium">{lastSyncAt ? new Date(lastSyncAt).toLocaleString("pt-BR") : "—"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Último erro</div>
                <div className="mt-1 font-medium">{lastErrorAt ? new Date(lastErrorAt).toLocaleString("pt-BR") : "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Conversas no banco</div><div className="text-2xl font-bold">{stats.conversations}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Vínculos criados</div><div className="text-2xl font-bold">{stats.linked}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Match por email</div><div className="text-2xl font-bold">{matchByEmail}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Match por telefone</div><div className="text-2xl font-bold">{matchByPhone}</div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Erros (total)</div><div className="text-2xl font-bold">{totalErrors}</div></CardContent></Card>
        </div>


        {/* Estratégia de match */}
        <Card>
          <CardHeader>
            <CardTitle>Estratégia de match</CardTitle>
            <CardDescription>Define como o contato é localizado no ActiveCampaign. A chave usada fica registrada no vínculo (coluna "Match" da tabela abaixo).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">Buscar por email</Label>
                <p className="text-xs text-muted-foreground">Tenta primeiro o email do contato (chave primária).</p>
              </div>
              <Switch checked={useEmail} onCheckedChange={setUseEmail} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">Apenas email primário</Label>
                <p className="text-xs text-muted-foreground">Quando ativo, ignora emails adicionais do contato no Chatwoot.</p>
              </div>
              <Switch checked={primaryEmailOnly} onCheckedChange={setPrimaryEmailOnly} disabled={!useEmail} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">Fallback por telefone</Label>
                <p className="text-xs text-muted-foreground">Se o email não bater, tenta localizar pelo telefone.</p>
              </div>
              <Switch checked={usePhone} onCheckedChange={setUsePhone} />
            </div>
          </CardContent>
        </Card>


        {/* Backfill */}
        <Card>
          <CardHeader>
            <CardTitle>Sincronizar histórico</CardTitle>
            <CardDescription>Processa as últimas N conversas do Chatwoot e tenta anexar a nota no AC. Idempotente — re-rodar atualiza a nota existente.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Quantidade (máx 1000)</Label>
              <Input type="number" min={1} max={1000} value={backfillLimit} onChange={(e) => setBackfillLimit(e.target.value)} className="w-32" />
            </div>
            <Button onClick={handleBackfill} disabled={backfilling}>
              {backfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Rodar backfill
            </Button>
            <span className="text-xs text-muted-foreground">~5 conversas/s. Conversas novas são sincronizadas automaticamente via webhook.</span>
          </CardContent>
        </Card>

        {/* Single */}
        <Card>
          <CardHeader>
            <CardTitle>Re-sincronizar uma conversa</CardTitle>
            <CardDescription>Útil para forçar a re-tentativa de uma conversa específica.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Conversation ID (Chatwoot)</Label>
              <Input value={singleId} onChange={(e) => setSingleId(e.target.value)} placeholder="ex: 1234" className="w-48 font-mono" />
            </div>
            <Button onClick={handleSyncOne} disabled={syncingOne} variant="outline">
              {syncingOne ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
          </CardContent>
        </Card>

        {/* Links table */}
        <Card>
          <CardHeader>
            <CardTitle>Vínculos recentes ({links.length})</CardTitle>
            <CardDescription>Últimas 30 conversas com nota criada/atualizada no AC.</CardDescription>
          </CardHeader>
          <CardContent>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vínculo ainda. Rode um backfill para começar.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conv #</TableHead>
                      <TableHead>Contato AC</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Sincronizado em</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.chatwoot_conversation_id}</TableCell>
                        <TableCell className="font-mono text-xs">{l.ac_contact_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{l.match_method}</Badge>
                          {l.match_value && <span className="ml-2 text-xs text-muted-foreground">{l.match_value}</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(l.last_synced_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="flex gap-2">
                          {cwLink(l.chatwoot_conversation_id) && (
                            <a href={cwLink(l.chatwoot_conversation_id)!} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                              CW <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {acLink(l.ac_contact_id) && (
                            <a href={acLink(l.ac_contact_id)!} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                              AC <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Errors */}
        {errors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Erros recentes ({errors.length})
              </CardTitle>
              <CardDescription>Maioria são "sem match" (contato não existe no AC) — esperado, apenas auditoria.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conv #</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.ac_id || "—"}</TableCell>
                      <TableCell className="text-sm">{e.error_message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
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
