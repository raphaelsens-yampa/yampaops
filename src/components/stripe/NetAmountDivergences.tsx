import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { EditConversionDialog, type ConversionToEdit } from "@/components/stripe/EditConversionDialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DivergenceRow {
  id: string;
  ac_id: string;
  error_message: string;
  payload: any;
  created_at: string;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NetAmountDivergences() {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [validatingAll, setValidatingAll] = useState(false);
  const [editing, setEditing] = useState<ConversionToEdit | null>(null);

  const { data: rows = [], refetch, isLoading } = useQuery({
    queryKey: ["net-amount-divergences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_sync_errors")
        .select("id, ac_id, error_message, payload, created_at")
        .eq("entity_type", "stripe_net_amount_mismatch")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as DivergenceRow[];
    },
  });

  const byReason = rows.reduce<Record<string, number>>((acc, r) => {
    const first = (r.error_message || "").split(" | ")[0] || "outros";
    acc[first] = (acc[first] || 0) + 1;
    return acc;
  }, {});

  async function refetchInvoice(conversionId: string) {
    setBusyId(conversionId);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-backfill-net-amounts", {
        body: { ids: [conversionId], only_missing: false, limit: 1 },
      });
      if (error) throw error;
      toast({
        title: "Invoice rebuscada",
        description: `Atualizadas ${data?.updated ?? 0} · sem invoice ${data?.skipped_no_invoice ?? 0} · erros ${data?.failed ?? 0}`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function reapplyCommission(conversionId: string) {
    setBusyId(conversionId);
    try {
      const { error } = await supabase.rpc("apply_commission_from_stripe", { p_stripe_id: conversionId });
      if (error) throw error;
      const { data: issues } = await supabase.rpc("validate_stripe_net_amount", { p_id: conversionId });
      const list = Array.isArray(issues) ? (issues as string[]) : [];
      if (list.length === 0) {
        await supabase.from("integration_sync_errors")
          .update({ resolved: true })
          .eq("entity_type", "stripe_net_amount_mismatch")
          .eq("ac_id", conversionId)
          .eq("resolved", false);
      }
      toast({ title: "Comissão reprocessada", description: list.length ? "Ainda há divergência." : "Divergência resolvida." });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function markResolved(divergenceId: string) {
    setBusyId(divergenceId);
    try {
      const { error } = await supabase
        .from("integration_sync_errors")
        .update({ resolved: true })
        .eq("id", divergenceId);
      if (error) throw error;
      toast({ title: "Marcada como resolvida" });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function validateAll() {
    if (!confirm("Rodar validação de consistência em todas as conversões dos últimos 400 dias?")) return;
    setValidatingAll(true);
    try {
      const { data, error } = await supabase.rpc("validate_stripe_net_amount_range", {});
      if (error) throw error;
      const r = data as any;
      toast({
        title: "Validação concluída",
        description: `Analisadas ${r?.scanned ?? 0} · sinalizadas ${r?.flagged ?? 0} · limpas ${r?.cleared ?? 0}`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setValidatingAll(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Divergências de valor líquido
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Conversões cujo valor líquido, MRR ou cupom não bate entre o Stripe e o banco.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={validateAll} disabled={validatingAll}>
            {validatingAll ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Validar consistência agora
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Nenhuma divergência aberta. Tudo consistente.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="destructive">{rows.length} pendências</Badge>
              {Object.entries(byReason).map(([reason, count]) => (
                <Badge key={reason} variant="outline" className="text-xs">
                  {reason}: {count}
                </Badge>
              ))}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">MRR net</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Desc.</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const p = r.payload || {};
                    const conv = p.id ? p : { id: r.ac_id, ...p };
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{conv.customer_email || "—"}</div>
                          <div className="text-muted-foreground">{conv.coupon_name || conv.coupon_id || ""}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {conv.converted_at
                            ? format(new Date(conv.converted_at), "dd/MM/yyyy", { locale: ptBR })
                            : format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtBRL(conv.mrr)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtBRL(conv.mrr_net)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtBRL(conv.net_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtBRL(conv.discount_amount)}</TableCell>
                        <TableCell className="text-xs max-w-[280px]">{r.error_message}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" disabled={busyId === r.ac_id}
                              onClick={() => refetchInvoice(r.ac_id)}
                              title="Rebuscar invoice no Stripe">
                              <RefreshCw className={`h-3.5 w-3.5 ${busyId === r.ac_id ? "animate-spin" : ""}`} />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busyId === r.ac_id}
                              onClick={() => reapplyCommission(r.ac_id)}
                              title="Reaplicar comissão">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busyId === r.id}
                              onClick={() => markResolved(r.id)}
                              title="Marcar como resolvida">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
