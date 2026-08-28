import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { ProfileLite } from "@/pages/Comissionamento";

interface ClawbackRow {
  id: string;
  conversion_id: string;
  customer_email: string | null;
  canceled_at: string;
  months_since_sale: number;
  original_amount: number;
  clawback_amount: number;
  payment_month: string;
  seller_user_id: string | null;
  status: string;
  forgiven_at: string | null;
}

interface Props {
  profiles: ProfileLite[];
  onChanged?: () => void;
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const firstDay = (key: string) => `${key}-01`;
const lastDay = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).toISOString().slice(0, 10);
};
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export function CommissionClawbacksPanel({ profiles, onChanged }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<ClawbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("commission_clawbacks").select("*").gte("canceled_at", firstDay(month)).lte("canceled_at", lastDay(month)).order("canceled_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar estornos", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data as ClawbackRow[]) || []);
  }, [month, status, toast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const totals = useMemo(() => ({
    count: rows.length,
    original: rows.reduce((sum, row) => sum + Number(row.original_amount || 0), 0),
    clawback: rows.reduce((sum, row) => sum + Number(row.clawback_amount || 0), 0),
  }), [rows]);

  const sellerName = (id: string | null) => {
    if (!id) return "Sem vendedor";
    const profile = profiles.find((item) => item.user_id === id);
    return profile?.full_name || profile?.email || id;
  };

  const runGeneration = async (dryRun: boolean) => {
    setRunning(true);
    setDryRunResult(null);
    const { data, error } = await supabase.rpc("generate_commission_clawbacks", {
      p_from: firstDay(month),
      p_to: lastDay(month),
      p_dry_run: dryRun,
    });
    setRunning(false);
    if (error) {
      toast({ title: "Falha ao gerar estornos", description: error.message, variant: "destructive" });
      return;
    }
    if (dryRun) setDryRunResult((data as Record<string, unknown>) || null);
    toast({ title: dryRun ? "Simulação concluída" : "Estornos gerados" });
    await fetchRows();
    onChanged?.();
  };

  const forgive = async (row: ClawbackRow) => {
    const reason = window.prompt("Informe o motivo do perdão do estorno:");
    if (!reason?.trim() || !session?.user?.id) return;
    const { error } = await supabase.from("commission_clawbacks").update({
      status: "forgiven",
      forgiven_by: session.user.id,
      forgiven_at: new Date().toISOString(),
      forgiven_reason: reason.trim(),
    }).eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao perdoar estorno", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estorno perdoado", description: "O motivo foi registrado no histórico." });
    fetchRows();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4" /> Estornos por churn</CardTitle>
          <CardDescription className="mt-1 text-xs">Cruza a base histórica de churn com as comissões dentro do período de garantia.</CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Mês do cancelamento</Label>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-40" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="forgiven">Perdoados</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchRows} disabled={loading} title="Atualizar estornos"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Registros</div><div className="text-xl font-semibold">{totals.count}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Comissão original</div><div className="text-xl font-semibold">{brl(totals.original)}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Impacto no pagamento</div><div className="text-xl font-semibold text-destructive">{brl(totals.clawback)}</div></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => runGeneration(true)} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Simular cruzamento
          </Button>
          <Button onClick={() => runGeneration(false)} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Gerar estornos
          </Button>
          {dryRunResult && <Badge variant="secondary">Encontrados: {String(dryRunResult.matches ?? 0)} · Total: {brl(Number(dryRunResult.total_amount ?? 0))}</Badge>}
        </div>

        <Table>
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Cancelamento</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Meses</TableHead><TableHead className="text-right">Original</TableHead><TableHead className="text-right">Estorno</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum estorno no período.</TableCell></TableRow>}
            {!loading && rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[220px] truncate">{row.customer_email || "—"}</TableCell>
                <TableCell>{dateBR(row.canceled_at)}</TableCell>
                <TableCell>{sellerName(row.seller_user_id)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.months_since_sale}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(Number(row.original_amount || 0))}</TableCell>
                <TableCell className="text-right font-medium text-destructive tabular-nums">{brl(Number(row.clawback_amount || 0))}</TableCell>
                <TableCell><Badge variant={row.status === "forgiven" ? "secondary" : "destructive"}>{row.status === "forgiven" ? "Perdoado" : "Pendente"}</Badge></TableCell>
                <TableCell>{row.status !== "forgiven" && <Button size="sm" variant="ghost" onClick={() => forgive(row)}>Perdoar</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
