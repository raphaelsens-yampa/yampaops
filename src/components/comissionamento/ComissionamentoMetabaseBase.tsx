import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Download, FileSpreadsheet, RefreshCw, RotateCcw, Users, Wallet } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BRL, type PriceMapEntry } from "@/lib/commissioning";

type BaseRow = {
  id: number | string;
  data_snapshot: string;
  mes_fechado?: string | null;
  company_id: string | null;
  email: string | null;
  plano: string | null;
  nome_oferta: string | null;
  stripe_price_id: string | null;
  mrr: number | null;
  previous_mrr: number | null;
  data_pagamento: string | null;
  classificacao_company: string | null;
  origem_cliente: string | null;
  gateway: string | null;
  recorrencia_pagamento: string | null;
};

type SnapshotSource = "daily" | "monthly";
interface Props { priceMap: PriceMapEntry[]; onChanged: () => void; }

const currentMonthSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
const brDate = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const classificationLabel = (value: string | null) => {
  const normalized = (value || "").trim().toLowerCase();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Sem classificação";
};
const classificationKey = (value: string | null) => (value || "").trim().toLowerCase();
const sellerLabel = (map: PriceMapEntry | undefined) => map?.seller_label || map?.seller_user_id || "Sem vendedor";

export function ComissionamentoMetabaseBase({ priceMap, onChanged }: Props) {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonthSP());
  const [rows, setRows] = useState<BaseRow[]>([]);
  const [source, setSource] = useState<SnapshotSource>("daily");
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"close" | "reprocess" | null>(null);

  const priceById = useMemo(() => new Map(priceMap.filter((item) => item.price_id).map((item) => [item.price_id!.trim().toLowerCase(), item])), [priceMap]);

  const load = useCallback(async () => {
    setLoading(true);
    const monthly = await supabase.from("metas_ativos_pagantes_monthly").select("*").eq("mes_fechado", `${month}-01`).order("data_snapshot", { ascending: false }).limit(5000);
    if (monthly.error) {
      toast({ title: "Erro ao carregar a Base Metabase", description: monthly.error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    if (monthly.data && monthly.data.length > 0) {
      setRows((monthly.data as BaseRow[]) || []);
      setSource("monthly");
      setSnapshotDate(monthly.data[0].data_snapshot);
      setLoading(false);
      return;
    }

    const daily = await supabase.from("metas_ativos_pagantes_daily").select("*").order("data_snapshot", { ascending: false }).limit(5000);
    if (daily.error) {
      toast({ title: "Erro ao carregar a Base Metabase", description: daily.error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const latest = daily.data?.[0]?.data_snapshot || null;
    const latestRows = (daily.data || []).filter((row) => row.data_snapshot === latest) as BaseRow[];
    setRows(latestRows);
    setSource("daily");
    setSnapshotDate(latest);
    setLoading(false);
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const result = new Map<string, { count: number; mrr: number }>();
    for (const row of rows) {
      const key = classificationKey(row.classificacao_company) || "sem classificação";
      const current = result.get(key) || { count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += Number(row.mrr || 0);
      result.set(key, current);
    }
    return result;
  }, [rows]);

  const payableRows = useMemo(() => rows.filter((row) => ["novo pagante", "recuperado", "upsell"].includes(classificationKey(row.classificacao_company))), [rows]);
  const missingMap = useMemo(() => {
    const map = new Map<string, { priceId: string; plan: string; count: number; mrr: number }>();
    for (const row of payableRows) {
      const priceId = row.stripe_price_id?.trim() || "(sem Price ID)";
      if (priceById.has(priceId.toLowerCase())) continue;
      const current = map.get(priceId) || { priceId, plan: row.plano || row.nome_oferta || "—", count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += Number(row.mrr || 0);
      map.set(priceId, current);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [payableRows, priceById]);

  const sellerRows = useMemo(() => {
    const map = new Map<string, { seller: string; count: number; mrr: number }>();
    for (const row of payableRows) {
      const mapped = row.stripe_price_id ? priceById.get(row.stripe_price_id.trim().toLowerCase()) : undefined;
      const seller = sellerLabel(mapped);
      const current = map.get(seller) || { seller, count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += Number(row.mrr || 0);
      map.set(seller, current);
    }
    return Array.from(map.values()).sort((a, b) => a.seller.localeCompare(b.seller));
  }, [payableRows, priceById]);

  const planRows = useMemo(() => {
    const map = new Map<string, { plan: string; priceId: string; count: number; mrr: number }>();
    for (const row of payableRows) {
      const key = `${row.plano || row.nome_oferta || "—"}|${row.stripe_price_id || "—"}`;
      const current = map.get(key) || { plan: row.plano || row.nome_oferta || "—", priceId: row.stripe_price_id || "—", count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += Number(row.mrr || 0);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [payableRows]);

  const exportBase = (kind: "csv" | "xlsx") => {
    const data = rows.map((row) => ({
      "Data fotografia": row.data_snapshot,
      "Mês fechado": row.mes_fechado || "",
      Empresa: row.company_id || "",
      Email: row.email || "",
      Classificação: classificationLabel(row.classificacao_company),
      Plano: row.plano || row.nome_oferta || "",
      "Price ID": row.stripe_price_id || "",
      MRR: Number(row.mrr || 0),
      "Previous MRR": row.previous_mrr == null ? "" : Number(row.previous_mrr),
      "Data Pagamento": row.data_pagamento || "",
      Vendedor: sellerLabel(row.stripe_price_id ? priceById.get(row.stripe_price_id.trim().toLowerCase()) : undefined),
    }));
    const stamp = `${month}-${source}`;
    if (kind === "csv") {
      const headers = Object.keys(data[0] || { Base: "" });
      const csv = [headers, ...data.map((row) => headers.map((header) => String(row[header as keyof typeof row] ?? "").replaceAll('"', '""')))].map((line) => line.map((value) => `"${value}"`).join(",")).join("\n");
      saveAs(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `base_metabase_${stamp}.csv`);
    } else {
      const sheet = XLSX.utils.json_to_sheet(data);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Base Metabase");
      saveAs(new Blob([XLSX.write(book, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }), `base_metabase_${stamp}.xlsx`);
    }
    toast({ title: "Exportação concluída", description: `${data.length} linhas exportadas.` });
  };

  const runAction = async (action: "close" | "reprocess") => {
    setRunning(action);
    const rpc = action === "close" ? "close_ativos_pagantes_month" : "apply_commissions_from_metabase";
    const { data, error } = await supabase.rpc(rpc, { p_month: `${month}-01` });
    setRunning(null);
    if (error) {
      toast({ title: action === "close" ? "Erro ao fechar fotografia" : "Erro ao recalcular comissões", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: action === "close" ? "Fotografia fechada" : "Comissões recalculadas", description: JSON.stringify(data) });
    await load();
    onChanged();
  };

  const metric = (key: string) => summary.get(key) || { count: 0, mrr: 0 };
  const relevantMissingMrr = rows.filter((row) => classificationKey(row.classificacao_company) === "upsell" && row.previous_mrr == null).length;
  const sourceLabel = source === "monthly" ? "Fotografia fechada" : "Snapshot diário mais recente";

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Base Metabase</h2>
          <p className="text-sm text-muted-foreground">Fonte oficial das conversões: Novos Pagantes, Recuperados e Upsell.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Mês de pagamento</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" /></div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Atualizar base"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => exportBase("csv")} disabled={loading || rows.length === 0}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" onClick={() => exportBase("xlsx")} disabled={loading || rows.length === 0}><FileSpreadsheet className="h-4 w-4" /> XLSX</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={source === "monthly" ? "default" : "secondary"}>{sourceLabel}</Badge>
        <span>Snapshot: {brDate(snapshotDate)}</span>
        <span>·</span><span>Fuso: São Paulo (UTC−3)</span>
      </div>

      {relevantMissingMrr > 0 && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Upsells sem Previous MRR</AlertTitle><AlertDescription>{relevantMissingMrr} linha(s) não podem gerar comissão de delta até a base Metabase ser recarregada com o MRR anterior.</AlertDescription></Alert>}
      {missingMap.length > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Price IDs sem de-para</AlertTitle><AlertDescription>{missingMap.length} Price ID(s) não estão no mapa de preços e aparecerão em “Sem vendedor” até a atribuição/correção do cadastro.</AlertDescription></Alert>}

      {loading ? <div className="py-12 text-center text-muted-foreground">Carregando fotografia...</div> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["novo pagante", "recuperado", "upsell", "downsell"] as const).map((key) => {
            const value = metric(key);
            return <Card key={key}><CardHeader className="pb-2"><CardTitle className="text-sm">{classificationLabel(key)}</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{value.count}</div><p className="text-xs text-muted-foreground">{BRL(value.mrr)} em MRR</p></CardContent></Card>;
          })}
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-sm"><CalendarCheck className="h-4 w-4" /> Operações da fotografia</CardTitle><CardDescription>Feche a referência do mês ou reprocese as comissões usando exclusivamente a base Metabase.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => runAction("close")} disabled={running !== null || source === "monthly"}>{running === "close" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} Fechar fotografia</Button><Button onClick={() => runAction("reprocess")} disabled={running !== null || payableRows.length === 0}>{running === "reprocess" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Recalcular comissões</Button></div></CardHeader>
          <CardContent><div className="grid gap-3 text-sm md:grid-cols-3"><div className="rounded-md border p-3"><div className="text-muted-foreground">Linhas na fotografia</div><div className="text-xl font-semibold">{rows.length}</div></div><div className="rounded-md border p-3"><div className="text-muted-foreground">Linhas comissionáveis</div><div className="text-xl font-semibold">{payableRows.length}</div></div><div className="rounded-md border p-3"><div className="text-muted-foreground">MRR comissionável informado</div><div className="text-xl font-semibold">{BRL(payableRows.reduce((sum, row) => sum + Number(row.mrr || 0), 0))}</div></div></div></CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" /> Por vendedor</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{sellerRows.map((row) => <TableRow key={row.seller}><TableCell>{row.seller}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right tabular-nums">{BRL(row.mrr)}</TableCell></TableRow>)}{sellerRows.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nenhuma conversão no período.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Wallet className="h-4 w-4" /> Por plano e Price ID</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Plano</TableHead><TableHead>Price ID</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{planRows.map((row) => <TableRow key={`${row.plan}-${row.priceId}`}><TableCell>{row.plan}</TableCell><TableCell className="max-w-48 truncate text-xs">{row.priceId}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right tabular-nums">{BRL(row.mrr)}</TableCell></TableRow>)}{planRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nenhuma conversão no período.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        </div>

        {missingMap.length > 0 && <Card><CardHeader><CardTitle className="text-sm">Price IDs sem de-para</CardTitle><CardDescription>Cadastre o Price ID no Mapa de Preços para resolver vendedor, plano e regra de comissão.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Price ID</TableHead><TableHead>Plano</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{missingMap.map((row) => <TableRow key={row.priceId}><TableCell className="font-mono text-xs">{row.priceId}</TableCell><TableCell>{row.plan}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right tabular-nums">{BRL(row.mrr)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
      </>}
    </div>
  );
}
