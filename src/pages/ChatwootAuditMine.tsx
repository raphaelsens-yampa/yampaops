import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";
import { useEffect } from "react";

export default function ChatwootAuditMine() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { buildConversationUrl } = useChatwootIntegration();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-audits", user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data, error } = await supabase.from("chatwoot_conversation_audits")
        .select("*")
        .ilike("assignee_email", user!.email!)
        .order("conversation_resolved_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Marca como visualizadas ao entrar
  const markSeen = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      await supabase.from("chatwoot_conversation_audits")
        .update({ seller_seen_at: new Date().toISOString() })
        .in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-audits"] }),
  });

  useEffect(() => {
    const unseen = rows.filter((r: any) => !r.seller_seen_at).map((r: any) => r.id);
    if (unseen.length) markSeen.mutate(unseen);
  }, [rows.length]);

  return (
    <Layout>
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Minhas Auditorias</h1>
          <p className="text-sm text-muted-foreground">Análises da IA das suas conversas resolvidas.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{rows.length} auditoria(s)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
              rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma auditoria ainda.</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severidade</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Resumo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any) => {
                      const sev = r.human_severity || r.severity;
                      const score = r.human_overall_score ?? r.overall_score;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Badge variant="outline" className={sev === "critical" ? "bg-destructive/15 text-destructive" : sev === "attention" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}>{sev}</Badge>
                            {r.human_reviewed_at && <Badge variant="outline" className="ml-1 text-[10px]">revisado</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.conversation_resolved_at ? format(new Date(r.conversation_resolved_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{Number(score).toFixed(0)}</TableCell>
                          <TableCell className="max-w-md truncate text-xs text-muted-foreground">{r.summary}</TableCell>
                          <TableCell>
                            {buildConversationUrl(r.conversation_id) && (
                              <Button asChild size="icon" variant="ghost"><a href={buildConversationUrl(r.conversation_id)!} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
