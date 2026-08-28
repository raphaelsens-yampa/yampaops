import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, LockKeyhole, RefreshCw, UnlockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { ProfileLite } from "@/pages/Comissionamento";

interface ClosingRow { id: string; payment_month: string; status: string; total_commission: number; total_clawback: number; closed_at: string | null; paid_at: string | null; notes: string | null; }
interface ConversionAmount { commission_amount: number; resolved_seller_user_id: string | null; resolved_seller_label: string | null; status: string; }
interface ClawbackAmount { clawback_amount: number; seller_user_id: string | null; status: string; }
interface Props { profiles: ProfileLite[]; onChanged?: () => void; }

const currentMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const monthDate = (month: string) => `${month}-01`;
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CommissionClosingPanel({ profiles, onChanged }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [closing, setClosing] = useState<ClosingRow | null>(null);
  const [conversions, setConversions] = useState<ConversionAmount[]>([]);
  const [clawbacks, setClawbacks] = useState<ClawbackAmount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [closingResult, conversionResult, clawbackResult] = await Promise.all([
      supabase.from("commission_closings").select("*").eq("payment_month", monthDate(month)).maybeSingle(),
      supabase.from("commission_conversions").select("commission_amount, resolved_seller_user_id, resolved_seller_label, status").eq("payment_month", monthDate(month)),
      supabase.from("commission_clawbacks").select("clawback_amount, seller_user_id, status").eq("payment_month", monthDate(month)),
    ]);
    setLoading(false);
    if (closingResult.error || conversionResult.error || clawbackResult.error) {
      toast({ title: "Erro ao carregar fechamento", description: closingResult.error?.message || conversionResult.error?.message || clawbackResult.error?.message, variant: "destructive" });
      return;
    }
    setClosing((closingResult.data as ClosingRow | null) || null);
    setConversions((conversionResult.data as ConversionAmount[]) || []);
    setClawbacks((clawbackResult.data as ClawbackAmount[]) || []);
  }, [month, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totals = useMemo(() => {
    const commission = conversions.filter((row) => row.status !== "ignored").reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const clawback = clawbacks.filter((row) => row.status !== "forgiven").reduce((sum, row) => sum + Number(row.clawback_amount || 0), 0);
    return { commission, clawback, net: commission + clawback };
  }, [conversions, clawbacks]);

  const sellerRows = useMemo(() => {
    const map = new Map<string, { name: string; commission: number; clawback: number }>();
    const getName = (id: string | null, label: string | null) => {
      if (!id) return label || "Sem vendedor";
      const profile = profiles.find((item) => item.user_id === id);
      return profile?.full_name || profile?.email || label || id;
    };
    for (const row of conversions) {
      if (row.status === "ignored") continue;
      const key = row.resolved_seller_user_id || `label:${row.resolved_seller_label || "none"}`;
      const current = map.get(key) || { name: getName(row.resolved_seller_user_id, row.resolved_seller_label), commission: 0, clawback: 0 };
      current.commission += Number(row.commission_amount || 0);
      map.set(key, current);
    }
    for (const row of clawbacks) {
      if (row.status === "forgiven") continue;
      const key = row.seller_user_id || "label:none";
      const current = map.get(key) || { name: getName(row.seller_user_id, null), commission: 0, clawback: 0 };
      current.clawback += Number(row.clawback_amount || 0);
      map.set(key, current);
    }
    return Array.from(map.values()).map((row) => ({ ...row, net: row.commission + row.clawback })).sort((a, b) => b.net - a.net);
  }, [clawbacks, conversions, profiles]);

  const saveStatus = async (nextStatus: "open" | "review" | "closed" | "paid") => {
    if (nextStatus === "paid" && closing?.status !== "closed") {
      toast({ title: "Fechamento necessário", description: "Marque o mês como fechado antes de registrar o pagamento.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      payment_month: monthDate(month),
      status: nextStatus,
      total_commission: totals.commission,
      total_clawback: totals.clawback,
      closed_by: nextStatus === "closed" || nextStatus === "paid" ? session?.user?.id || null : closing?.closed_by || null,
      closed_at: nextStatus === "closed" || nextStatus === "paid" ? closing?.closed_at || new Date().toISOString() : closing?.closed_at || null,
      paid_at: nextStatus === "paid" ? new Date().toISOString() : closing?.paid_at || null,
    };
    const result = closing
      ? await supabase.from("commission_closings").update(payload).eq("id", closing.id)
      : await supabase.from("commission_closings").insert(payload);
    setSaving(false);
    if (result.error) {
      toast({ title: "Erro ao atualizar fechamento", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: nextStatus === "paid" ? "Pagamento registrado" : `Mês marcado como ${nextStatus === "review" ? "em revisão" : nextStatus === "closed" ? "fechado" : "aberto"}` });
    await fetchData();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><CardTitle className="flex items-center gap-2 text-sm font-medium"><LockKeyhole className="h-4 w-4" /> Fechamento mensal</CardTitle><CardDescription className="mt-1 text-xs">Congele o mês de pagamento depois da revisão. Reprocessamentos respeitam o fechamento.</CardDescription></div>
        <div className="flex items-end gap-2"><div><Label className="text-xs">Mês de pagamento</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-40" /></div><Button variant="outline" size="icon" onClick={fetchData} disabled={loading} title="Atualizar fechamento"><RefreshCw className="h-4 w-4" /></Button></div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? <div className="py-8 text-center text-muted-foreground">Carregando...</div> : <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Comissões</div><div className="text-xl font-semibold">{brl(totals.commission)}</div></div>
            <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Estornos</div><div className="text-xl font-semibold text-destructive">{brl(totals.clawback)}</div></div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3"><div className="text-xs text-muted-foreground">Líquido a pagar</div><div className="text-xl font-semibold">{brl(totals.net)}</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={closing?.status === "closed" || closing?.status === "paid" ? "default" : "secondary"}>{closing?.status === "review" ? "Em revisão" : closing?.status === "closed" ? "Fechado" : closing?.status === "paid" ? "Pago" : "Aberto"}</Badge>
            <Button size="sm" variant="outline" onClick={() => saveStatus("review")} disabled={saving || closing?.status === "paid"}><UnlockKeyhole className="mr-2 h-4 w-4" /> Em revisão</Button>
            <Button size="sm" onClick={() => saveStatus("closed")} disabled={saving || closing?.status === "paid"}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Fechar mês</Button>
            <Button size="sm" variant="secondary" onClick={() => saveStatus("paid")} disabled={saving || closing?.status !== "closed"}>Registrar pagamento</Button>
          </div>
          <Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Comissões</TableHead><TableHead className="text-right">Estornos</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader><TableBody>
            {sellerRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma movimentação no mês.</TableCell></TableRow>}
            {sellerRows.map((row) => <TableRow key={row.name}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right tabular-nums">{brl(row.commission)}</TableCell><TableCell className="text-right text-destructive tabular-nums">{brl(row.clawback)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{brl(row.net)}</TableCell></TableRow>)}
          </TableBody></Table>
        </>}
      </CardContent>
    </Card>
  );
}
