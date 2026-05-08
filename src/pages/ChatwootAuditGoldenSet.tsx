import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useChatwootIntegration } from "@/hooks/useChatwootIntegration";

export default function ChatwootAuditGoldenSet() {
  const { role } = useAuth();
  if (role !== "admin") return <Navigate to="/atendimentos/auditoria" replace />;
  const qc = useQueryClient();
  const { buildConversationUrl } = useChatwootIntegration();
  const [testResult, setTestResult] = useState<any>(null);

  const { data: golden = [], isLoading } = useQuery({
    queryKey: ["golden-set"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chatwoot_audit_golden_set").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chatwoot_audit_golden_set").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido."); qc.invalidateQueries({ queryKey: ["golden-set"] }); },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("chatwoot-audit-golden-test");
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => { setTestResult(d); toast.success(`Concordância: ${(d.agreement * 100).toFixed(0)}%`); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Layout>
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/atendimentos/auditoria"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <h1 className="text-2xl font-heading font-bold">Golden Set</h1>
            <p className="text-sm text-muted-foreground">Conversas-referência para calibrar a IA. Adicione pela fila de revisão (botão estrela).</p>
          </div>
          <Button onClick={() => testMut.mutate()} disabled={testMut.isPending}>
            {testMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Testar rubrica atual
          </Button>
        </div>

        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado do teste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                Concordância IA × esperado: <Badge>{(testResult.agreement * 100).toFixed(0)}%</Badge> ({testResult.total} conversas)
              </div>
              <div className="text-xs">
                <p className="font-medium mb-1">Matriz de confusão (linhas = esperado, colunas = IA)</p>
                <table className="border-collapse">
                  <thead><tr><th></th><th className="px-2">ok</th><th className="px-2">attention</th><th className="px-2">critical</th></tr></thead>
                  <tbody>
                    {["ok", "attention", "critical"].map((row) => (
                      <tr key={row}><td className="px-2 font-medium">{row}</td>
                        {["ok", "attention", "critical"].map((col) => (
                          <td key={col} className={`px-2 text-center ${row === col ? "bg-success/20" : "bg-destructive/10"}`}>{testResult.matrix?.[row]?.[col] ?? 0}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">{golden.length} conversa(s)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
              golden.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conversa no Golden Set ainda.</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conversa</TableHead>
                      <TableHead>Severidade esperada</TableHead>
                      <TableHead>Score esperado</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {golden.map((g: any) => (
                      <TableRow key={g.id}>
                        <TableCell>#{g.conversation_id}</TableCell>
                        <TableCell><Badge variant="outline">{g.expected_severity}</Badge></TableCell>
                        <TableCell className="tabular-nums">{g.expected_overall_score ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate">{g.notes}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {buildConversationUrl(g.conversation_id) && (
                              <Button asChild size="icon" variant="ghost"><a href={buildConversationUrl(g.conversation_id)!} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
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
