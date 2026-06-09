import { useState, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { parseImportFile } from "@/lib/commissioningImport";
import {
  resolveRow,
  addMonths,
  toMonthStart,
  toDateOnly,
  formatMonthLabel,
  BRL,
  type CommissionReference,
  type PriceMapEntry,
  type ResolvedRow,
} from "@/lib/commissioning";

interface Props {
  priceMap: PriceMapEntry[];
  reference: CommissionReference[];
  onImported: () => void;
}

export function ComissionamentoImport({ priceMap, reference, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [parsed, setParsed] = useState<ResolvedRow[] | null>(null);
  const [periodMonth, setPeriodMonth] = useState<string>(""); // yyyy-mm
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleFileSelect = async (f: File) => {
    setFile(f);
    setParsing(true);
    setParsed(null);
    try {
      const result = await parseImportFile(f);
      setWarnings(result.warnings);
      const resolved = result.rows.map((r) => resolveRow(r, priceMap, reference));
      setParsed(resolved);
      if (result.detectedMonth) {
        const d = result.detectedMonth;
        setPeriodMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    } catch (e) {
      toast({ title: "Erro ao ler planilha", description: (e as Error).message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const paymentMonth = useMemo(() => {
    if (!periodMonth) return null;
    const [y, m] = periodMonth.split("-").map(Number);
    return addMonths(new Date(y, m - 1, 1), 2);
  }, [periodMonth]);

  const stats = useMemo(() => {
    if (!parsed) return null;
    const matched = parsed.filter((p) => p.status === "calculated").length;
    const pending = parsed.filter((p) => p.status === "pending_mapping").length;
    const total = parsed.reduce((s, p) => s + p.commission_amount, 0);
    const mrr = parsed.reduce((s, p) => s + (p.mrr ?? 0), 0);
    return { matched, pending, total, mrr, count: parsed.length };
  }, [parsed]);

  const sellerSummary = useMemo(() => {
    if (!parsed) return [];
    const map = new Map<string, { name: string; count: number; amount: number }>();
    for (const p of parsed) {
      if (p.status !== "calculated") continue;
      const name = p.matched?.seller_label || "—";
      const key = `${p.matched?.seller_user_id || ""}|${name}`;
      if (!map.has(key)) map.set(key, { name, count: 0, amount: 0 });
      const r = map.get(key)!;
      r.count++;
      r.amount += p.commission_amount;
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [parsed]);

  const handleCommit = async () => {
    if (!parsed || !periodMonth || !paymentMonth) return;
    const [y, m] = periodMonth.split("-").map(Number);
    const saleMonth = toMonthStart(new Date(y, m - 1, 1));
    setCommitting(true);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    const { data: importRow, error: importErr } = await supabase
      .from("commission_imports")
      .insert({
        period_month: toDateOnly(saleMonth),
        payment_month: toDateOnly(paymentMonth),
        source_file: file?.name || null,
        row_count: parsed.length,
        matched_count: stats?.matched ?? 0,
        pending_count: stats?.pending ?? 0,
        total_commission: stats?.total ?? 0,
        uploaded_by: uid,
        status: "committed",
      })
      .select("id")
      .single();

    if (importErr || !importRow) {
      setCommitting(false);
      toast({ title: "Erro ao criar importação", description: importErr?.message, variant: "destructive" });
      return;
    }

    const payload = parsed.map((p) => ({
      import_id: importRow.id,
      sale_month: toDateOnly(saleMonth),
      payment_month: toDateOnly(paymentMonth),
      company_id: p.company_id,
      customer_name: p.customer_name,
      customer_email: p.customer_email,
      price_id: p.price_id,
      offer_name: p.offer_name,
      gateway: p.gateway,
      mrr: p.mrr ?? 0,
      recurrence_days: p.recurrence_days,
      origem_cliente: p.origem_cliente,
      resolved_plan: p.matched?.plan_name ?? null,
      resolved_payment_type: p.matched?.payment_type ?? null,
      resolved_seller_user_id: p.matched?.seller_user_id ?? null,
      resolved_seller_label: p.matched?.seller_label ?? null,
      commission_pct: p.applied_pct,
      commission_amount: p.commission_amount,
      status: p.status,
    }));

    // batch insert in chunks of 500
    let i = 0;
    while (i < payload.length) {
      const chunk = payload.slice(i, i + 500);
      const { error: insErr } = await supabase.from("commission_conversions").insert(chunk);
      if (insErr) {
        setCommitting(false);
        toast({ title: "Erro ao salvar conversões", description: insErr.message, variant: "destructive" });
        return;
      }
      i += 500;
    }

    setCommitting(false);
    toast({
      title: "Importação concluída",
      description: `${payload.length} linhas salvas. Comissão a pagar em ${formatMonthLabel(paymentMonth)}.`,
    });
    setParsed(null);
    setFile(null);
    setPeriodMonth("");
    if (fileRef.current) fileRef.current.value = "";
    onImported();
  };

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Upload className="h-4 w-4" /> Importar Planilha de Conversões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription className="text-xs sm:text-sm">
              Envie o arquivo <strong>.xlsx</strong> exportado do Metabase (aba <strong>Resultado da consulta</strong>).
              O sistema vai cruzar cada linha com o <strong>Mapa de Preços</strong> e a <strong>Tabela de Referência</strong>
              para calcular automaticamente a comissão. A regra é <strong>M+2</strong>: vendas do mês M0 são pagas em M0 + 2 meses.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label>Arquivo XLSX</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                disabled={parsing || committing}
              />
            </div>
            <div className="sm:w-48">
              <Label>Mês de Referência (M0)</Label>
              <Input
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                disabled={!parsed}
              />
            </div>
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha...
            </div>
          )}

          {warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {warnings.map((w, i) => (<div key={i}>{w}</div>))}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {parsed && stats && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Total linhas</div>
                  <div className="text-xl font-bold">{stats.count}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Calculadas</div>
                  <div className="text-xl font-bold text-primary">{stats.matched}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Pendentes</div>
                  <div className="text-xl font-bold text-destructive">{stats.pending}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">MRR total</div>
                  <div className="text-base font-bold">{BRL(stats.mrr)}</div>
                </div>
                <div className="rounded-lg border p-3 bg-primary/5">
                  <div className="text-xs text-muted-foreground">Comissão</div>
                  <div className="text-base font-bold">{BRL(stats.total)}</div>
                </div>
              </div>

              {paymentMonth && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Mês da venda: <strong className="capitalize">{periodMonth && formatMonthLabel(new Date(Number(periodMonth.split("-")[0]), Number(periodMonth.split("-")[1]) - 1, 1))}</strong>
                    {" · "}
                    Comissão a pagar em: <strong className="capitalize">{formatMonthLabel(paymentMonth)}</strong>
                  </AlertDescription>
                </Alert>
              )}

              {sellerSummary.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Por vendedor</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left">Vendedor</TableHead>
                        <TableHead className="text-right"># Conv.</TableHead>
                        <TableHead className="text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellerSummary.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-left font-medium">{s.name}</TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right font-medium">{BRL(s.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setParsed(null); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  Cancelar
                </Button>
                <Button onClick={handleCommit} disabled={committing || !periodMonth}>
                  {committing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar importação
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Detalhe (primeiras 100 linhas)</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Cliente</TableHead>
                    <TableHead className="text-left">Plano resolvido</TableHead>
                    <TableHead className="text-left">Vendedor</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-left">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 100).map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-left">
                        <div className="font-medium">{p.customer_name || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {p.price_id || p.offer_name || ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-left">{p.matched?.plan_name || <span className="text-destructive italic">não mapeado</span>}</TableCell>
                      <TableCell className="text-left">{p.matched?.seller_label || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{BRL(p.mrr ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(p.applied_pct * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{BRL(p.commission_amount)}</TableCell>
                      <TableCell className="text-left">
                        {p.status === "pending_mapping"
                          ? <Badge variant="destructive">Pendente</Badge>
                          : <Badge variant="default">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
