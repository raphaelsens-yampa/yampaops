import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ORIGIN_LABELS } from "@/lib/constants";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Settings {
  sync_status: string | null;
  last_full_sync_at: string | null;
  sync_log: any;
}

interface OriginRow { origin: string; total: number; }
interface SyncError {
  id: string;
  entity_type: string;
  ac_id: string | null;
  error_message: string;
  created_at: string;
  resolved: boolean;
}

export default function IntegrationAudit() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [opsByOrigin, setOpsByOrigin] = useState<OriginRow[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [opsTotal, setOpsTotal] = useState(0);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [errorsByType, setErrorsByType] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [settingsRes, opsRes, contactsRes, errRes] = await Promise.all([
      supabase.from("integration_settings").select("sync_status, last_full_sync_at, sync_log").maybeSingle(),
      supabase.from("opportunities").select("origin").not("ac_id", "is", null),
      supabase.from("contacts").select("id", { count: "exact", head: true }).not("ac_id", "is", null),
      supabase.from("integration_sync_errors").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    setSettings((settingsRes.data as Settings) || null);

    const opsList = (opsRes.data as any[]) || [];
    setOpsTotal(opsList.length);
    const grouped = opsList.reduce<Record<string, number>>((acc, o) => {
      acc[o.origin] = (acc[o.origin] || 0) + 1;
      return acc;
    }, {});
    setOpsByOrigin(
      Object.entries(grouped)
        .map(([origin, total]) => ({ origin, total }))
        .sort((a, b) => b.total - a.total),
    );

    setContactsTotal(contactsRes.count || 0);

    const errList = (errRes.data as SyncError[]) || [];
    setErrors(errList);
    const errCounts = errList.reduce<Record<string, number>>((acc, e) => {
      acc[e.entity_type] = (acc[e.entity_type] || 0) + 1;
      return acc;
    }, {});
    setErrorsByType(errCounts);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const statusBadge = (s: string | null | undefined) => {
    if (s === "running")
      return (
        <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-amber-500/30">
          <Clock className="h-3 w-3 mr-1 animate-pulse" /> Em execução
        </Badge>
      );
    if (s === "error")
      return (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" /> Erro
        </Badge>
      );
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Ocioso
      </Badge>
    );
  };

  const log = settings?.sync_log as any;
  const totals = log?.totals;
  const results: any[] = log?.results || [];

  const webhookErrors = errors.filter((e) => e.entity_type === "webhook");
  const otherErrors = errors.filter((e) => e.entity_type !== "webhook");

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold">Auditoria de Importações</h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe a sincronização do ActiveCampaign, distribuição por origem e falhas do webhook.
            </p>
          </div>
          <Button onClick={load} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg">{statusBadge(settings?.sync_status)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Última sincronização</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-base font-medium">
                {settings?.last_full_sync_at
                  ? formatDistanceToNow(new Date(settings.last_full_sync_at), { addSuffix: true, locale: ptBR })
                  : "Nunca"}
              </div>
              {settings?.last_full_sync_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(settings.last_full_sync_at).toLocaleString("pt-BR")}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Deals importados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-primary">{opsTotal.toLocaleString("pt-BR")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contatos importados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold text-primary">{contactsTotal.toLocaleString("pt-BR")}</div>
            </CardContent>
          </Card>
        </div>

        {/* Last run breakdown */}
        {totals && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Última execução</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{totals.dealsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Deals</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totals.contactsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Contatos</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totals.stagesCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Stages</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totals.activitiesCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Atividades</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Per pipeline */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por pipeline (último run)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pipeline</TableHead>
                    <TableHead className="text-right">Deals</TableHead>
                    <TableHead className="text-right">Contatos</TableHead>
                    <TableHead className="text-right">Stages</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.pipeline}</TableCell>
                      <TableCell className="text-right">{r.dealsCount ?? "-"}</TableCell>
                      <TableCell className="text-right">{r.contactsCount ?? "-"}</TableCell>
                      <TableCell className="text-right">{r.stagesCount ?? "-"}</TableCell>
                      <TableCell>
                        {r.error ? (
                          <Badge variant="destructive" className="text-xs">{r.error.slice(0, 60)}</Badge>
                        ) : r.truncated ? (
                          <Badge variant="outline" className="text-xs">Parcial</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Origin distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição de deals importados por origem</CardTitle>
          </CardHeader>
          <CardContent>
            {opsByOrigin.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum deal importado ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">% do total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opsByOrigin.map((row) => (
                    <TableRow key={row.origin}>
                      <TableCell className="font-medium">
                        {ORIGIN_LABELS[row.origin as keyof typeof ORIGIN_LABELS] || row.origin}
                      </TableCell>
                      <TableCell className="text-right">{row.total.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {((row.total / opsTotal) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Falhas registradas
              {errors.length > 0 && <Badge variant="secondary">{errors.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="webhook">
              <TabsList>
                <TabsTrigger value="webhook">
                  Webhook {webhookErrors.length > 0 && `(${webhookErrors.length})`}
                </TabsTrigger>
                <TabsTrigger value="other">
                  Outros {otherErrors.length > 0 && `(${otherErrors.length})`}
                </TabsTrigger>
                <TabsTrigger value="summary">Resumo</TabsTrigger>
              </TabsList>

              <TabsContent value="webhook" className="mt-4">
                {webhookErrors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma falha de webhook registrada.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Mensagem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookErrors.slice(0, 30).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-sm">{e.error_message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="other" className="mt-4">
                {otherErrors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma outra falha registrada.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>AC ID</TableHead>
                        <TableHead>Mensagem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otherErrors.slice(0, 30).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{e.entity_type}</Badge></TableCell>
                          <TableCell className="text-xs">{e.ac_id || "-"}</TableCell>
                          <TableCell className="text-sm max-w-md truncate" title={e.error_message}>
                            {e.error_message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="summary" className="mt-4">
                {Object.keys(errorsByType).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem falhas registradas.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(errorsByType).map(([type, count]) => (
                      <Card key={type} className="border-destructive/30">
                        <CardContent className="pt-4">
                          <p className="text-xs text-muted-foreground uppercase">{type}</p>
                          <p className="text-2xl font-bold text-destructive">{count}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
