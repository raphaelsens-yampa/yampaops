import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { ManagerOnly } from "@/components/ManagerOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useDiscountClients,
  useDiscountTiers,
  useInvoicesForMonth,
  useTpvForMonth,
} from "@/hooks/useDiscountData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Calculator, TrendingDown, DollarSign, Users, AlertCircle } from "lucide-react";
import { calcDiscount, currentMonthStart, formatBRL, monthLabel } from "@/lib/discounts";
import { useAuth } from "@/hooks/useAuth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function DiscountOverviewPage() {
  return (
    <ManagerOnly>
      <Layout>
        <OverviewContent />
      </Layout>
    </ManagerOnly>
  );
}

function OverviewContent() {
  const [month, setMonth] = useState<string>(currentMonthStart());
  const { data: tiers = [] } = useDiscountTiers();
  const { data: clients = [] } = useDiscountClients();
  const { data: tpvRows = [] } = useTpvForMonth(month);
  const { data: invoices = [] } = useInvoicesForMonth(month);

  const tpvByClient = useMemo(() => {
    const m = new Map<string, number>();
    tpvRows.forEach((r) => m.set(r.client_id, Number(r.tpv_amount)));
    return m;
  }, [tpvRows]);

  const computed = useMemo(() => {
    return clients.map((c) => {
      const tpv = tpvByClient.get(c.id) ?? 0;
      const r = calcDiscount(tiers, c.plan_type, Number(c.saas_base_price), Number(c.embedded_software_value), tpv);
      return { client: c, tpv, ...r };
    });
  }, [clients, tiers, tpvByClient]);

  const totalTpv = computed.reduce((s, x) => s + x.tpv, 0);
  const totalDiscount = invoices.reduce((s, x) => s + Number(x.discount_applied || 0), 0);
  const activeDiscounts = invoices.filter((i) => Number(i.discount_applied) > 0).length;
  const churnTransacional = computed.filter((x) => x.tpv === 0).length;

  const distribution = useMemo(() => {
    const buckets = new Map<string, number>();
    tiers.forEach((t) => buckets.set(t.name, 0));
    buckets.set("Sem faixa", 0);
    computed.forEach(({ tier }) => {
      const key = tier?.name ?? "Sem faixa";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    return Array.from(buckets.entries()).map(([name, qtd]) => ({ name, qtd }));
  }, [computed, tiers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Cockpit de Descontos por TPV</h1>
          <p className="text-muted-foreground text-sm">Visão Sales Ops — {monthLabel(month)}</p>
        </div>
        <div>
          <Label className="text-xs">Mês de referência</Label>
          <Input type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(`${e.target.value}-01`)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<DollarSign />} label="TPV total da base" value={formatBRL(totalTpv)} accent="primary" />
        <KpiCard icon={<TrendingDown />} label="Desconto concedido" value={formatBRL(totalDiscount)} accent="warning" />
        <KpiCard icon={<Users />} label="Clientes c/ desconto ativo" value={String(activeDiscounts)} accent="success" />
        <KpiCard icon={<AlertCircle />} label="Churn transacional" value={String(churnTransacional)} accent="destructive" hint="TPV zero no mês" />
      </div>

      <SyncPanel month={month} clients={clients} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por faixa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo da apuração</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Faixa</TableHead><TableHead className="text-right">Clientes</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {distribution.map((d) => (
                  <TableRow key={d.name}>
                    <TableCell>
                      <Badge variant="outline">{d.name}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{d.qtd}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, accent, hint }: { icon: React.ReactNode; label: string; value: string; accent: "primary" | "warning" | "success" | "destructive"; hint?: string }) {
  const ring = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[accent];
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ring}`}>
          <div className="[&>svg]:h-5 [&>svg]:w-5">{icon}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="font-heading text-2xl font-bold truncate">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SyncPanel({ month, clients }: { month: string; clients: ReturnType<typeof useDiscountClients>["data"] }) {
  const { user } = useAuth();
  const { data: tiers = [] } = useDiscountTiers();
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function syncTpv() {
    if (!csv.trim()) return toast.error("Cole linhas no formato CNPJ;TPV");
    setBusy(true);
    setLog([]);
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let ok = 0;
    let fail = 0;
    const logs: string[] = [];

    const byCnpj = new Map<string, string>();
    (clients ?? []).forEach((c) => {
      const k = (c.cnpj || "").replace(/\D/g, "");
      if (k) byCnpj.set(k, c.id);
    });

    for (const line of lines) {
      const [rawCnpj, rawTpv] = line.split(/[;,\t]/);
      const cnpj = (rawCnpj || "").replace(/\D/g, "");
      const tpv = Number(String(rawTpv || "").replace(",", "."));
      const clientId = byCnpj.get(cnpj);
      if (!clientId) {
        fail++;
        logs.push(`✗ CNPJ ${rawCnpj}: cliente não encontrado`);
        continue;
      }
      if (!Number.isFinite(tpv)) {
        fail++;
        logs.push(`✗ CNPJ ${rawCnpj}: TPV inválido`);
        continue;
      }
      const { error } = await supabase
        .from("tpv_monthly")
        .upsert({ client_id: clientId, reference_month: month, tpv_amount: tpv, sync_status: "synced", synced_at: new Date().toISOString() } as any, { onConflict: "client_id,reference_month" });
      if (error) {
        fail++;
        logs.push(`✗ ${rawCnpj}: ${error.message}`);
      } else {
        ok++;
        logs.push(`✓ ${rawCnpj} → ${formatBRL(tpv)}`);
      }
    }
    setLog(logs);
    setBusy(false);
    toast.success(`Sincronizado: ${ok} ok, ${fail} falhas`);
    qc.invalidateQueries({ queryKey: ["tpv-monthly", month] });
  }

  async function processInvoices() {
    if (!clients || clients.length === 0) return toast.error("Nenhum cliente");
    setBusy(true);
    const { data: tpvRows } = await supabase.from("tpv_monthly").select("*").eq("reference_month", month);
    const tpvMap = new Map<string, number>();
    (tpvRows ?? []).forEach((r: any) => tpvMap.set(r.client_id, Number(r.tpv_amount)));

    const payloads = clients.map((c) => {
      const tpv = tpvMap.get(c.id) ?? 0;
      const r = calcDiscount(tiers, c.plan_type, Number(c.saas_base_price), Number(c.embedded_software_value), tpv);
      return {
        client_id: c.id,
        reference_month: month,
        tier_id: r.tier?.id ?? null,
        tpv_amount: tpv,
        original_value: r.originalValue,
        discount_applied: r.discount,
        final_value: r.finalValue,
        processed_at: new Date().toISOString(),
        processed_by: user?.id ?? null,
      };
    });

    const { error } = await supabase.from("invoice_log").upsert(payloads as any, { onConflict: "client_id,reference_month" });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Processadas ${payloads.length} faturas`);
      const zeradas = payloads.filter((p) => p.discount_applied === 0).length;
      const total = payloads.reduce((s, p) => s + p.discount_applied, 0);
      setLog([`✓ ${payloads.length} faturas calculadas`, `• Total de desconto: ${formatBRL(total)}`, `• Sem desconto: ${zeradas}`]);
      qc.invalidateQueries({ queryKey: ["invoice-log", month] });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Upload className="h-5 w-5" /> Sincronização de TPV & Processamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Simule o arquivo do subadquirente. Uma linha por cliente, formato <code>CNPJ;TPV</code> (também aceita vírgula ou tab).
        </p>
        <Textarea
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"12.345.678/0001-90;52000\n98.765.432/0001-10;31500"}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={syncTpv} disabled={busy} variant="outline">
            <Upload className="h-4 w-4" /> Sincronizar TPV ({monthLabel(month)})
          </Button>
          <Button onClick={processInvoices} disabled={busy}>
            <Calculator className="h-4 w-4" /> Processar Descontos do Mês
          </Button>
        </div>
        {log.length > 0 && (
          <div className="bg-muted/40 rounded-md p-3 max-h-48 overflow-auto text-xs font-mono space-y-0.5">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
