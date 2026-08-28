import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, DatabaseZap, Download, FileSpreadsheet, RefreshCw, RotateCcw, Users, Wallet } from "lucide-react";
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
const inMonth = (value: string | null | undefined, month: string) => Boolean(value && value.slice(0, 7) === month);
const nextMonthStart = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
};

const classificationLabel = (value: string | null) => {
  const normalized = (value || "").trim().toLowerCase();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Sem classificação";
};
const classificationKey = (value: string | null) => (value || "").trim().toLowerCase();
const COMMISSIONABLE_CLASSIFICATIONS = ["novo pagante", "recuperado", "upsell"] as const;
const sellerLabel = (map: PriceMapEntry | undefined) => map?.seller_label || map?.seller_user_id || "Sem vendedor";

export function ComissionamentoMetabaseBase({ priceMap, onChanged }: Props) {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonthSP());
  const [rows, setRows] = useState<BaseRow[]>([]);
  const [snapshotRowsCount, setSnapshotRowsCount] = useState(0);
  const [missingPaymentDates, setMissingPaymentDates] = useState(0);
  const [source, setSource] = useState<SnapshotSource>("daily");
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"close" | "reprocess" | null>(null);
  const [reloading, setReloading] = useState(false);
  const [detailFilter, setDetailFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");



  const priceById = useMemo(() => {
    const map = new Map<string, PriceMapEntry>();
    for (const item of priceMap) {
      const priceId = item.price_id?.trim().toLowerCase();
      if (priceId) map.set(priceId, item);
    }
    return map;
  }, [priceMap]);

  const load = useCallback(async () => {
    setLoading(true);
    const isCurrent = month === currentMonthSP();
    const monthStart = `${month}-01`;
    const monthEnd = nextMonthStart(month);

    const fail = (message: string) => {
      toast({ title: "Erro ao carregar a Base Metabase", description: message, variant: "destructive" });
      setRows([]);
      setSnapshotRowsCount(0);
      setMissingPaymentDates(0);
      setLoading(false);
    };

    const empty = (src: SnapshotSource) => {
      setRows([]);
      setSnapshotRowsCount(0);
      setMissingPaymentDates(0);
      setSource(src);
      setSnapshotDate(null);
      setLoading(false);
    };

    // Resolve qual tabela e qual fotografia usar
    const monthlyDate = await supabase
      .from("metas_ativos_pagantes_monthly")
      .select("data_snapshot")
      .eq("mes_fechado", monthStart)
      .order("data_snapshot", { ascending: false })
      .limit(1);
    if (monthlyDate.error) return fail(monthlyDate.error.message);

    let table: "metas_ativos_pagantes_monthly" | "metas_ativos_pagantes_daily" = "metas_ativos_pagantes_monthly";
    let src: SnapshotSource = "monthly";
    let snap: string | null = monthlyDate.data?.[0]?.data_snapshot || null;

    if (!snap) {
      table = "metas_ativos_pagantes_daily";
      src = "daily";
      // Mês fechado: a última fotografia DENTRO do mês. Mês vigente: a última fotografia existente.
      let dateQuery = supabase
        .from("metas_ativos_pagantes_daily")
        .select("data_snapshot")
        .order("data_snapshot", { ascending: false })
        .limit(1);
      if (!isCurrent) {
        dateQuery = dateQuery.gte("data_snapshot", monthStart).lt("data_snapshot", monthEnd);
      }
      const dailyDate = await dateQuery;
      if (dailyDate.error) return fail(dailyDate.error.message);
      snap = dailyDate.data?.[0]?.data_snapshot || null;
    }

    if (!snap) return empty(src);

    const scoped = () => {
      let q = (supabase.from(table) as any)
        .select("*")
        .eq("data_snapshot", snap)
        .eq("status_assinatura", "ativo")
        .in("classificacao_company", [...COMMISSIONABLE_CLASSIFICATIONS]);
      if (table === "metas_ativos_pagantes_monthly") q = q.eq("mes_fechado", monthStart);
      return q;
    };

    // Total da base comissionável no mês (contagem no servidor, sem trazer linhas)
    const totalCount = await (supabase.from(table) as any)
      .select("id", { count: "exact", head: true })
      .eq("data_snapshot", snap)
      .eq("status_assinatura", "ativo")
      .in("classificacao_company", [...COMMISSIONABLE_CLASSIFICATIONS])
      .gte("data_pagamento", monthStart)
      .lt("data_pagamento", monthEnd)
      .then((r: any) => r);
    if (totalCount.error) return fail(totalCount.error.message);

    const missingCount = await scoped()
      .select("id", { count: "exact", head: true })
      .is("data_pagamento", null);
    if (missingCount.error) return fail(missingCount.error.message);

    // Linhas do mês, paginadas (o Data API limita cada página a 1000 linhas)
    const pageSize = 1000;
    const collected: BaseRow[] = [];
    for (let page = 0; page < 20; page++) {
      const chunk = await scoped()
        .gte("data_pagamento", monthStart)
        .lt("data_pagamento", monthEnd)
        .order("data_pagamento", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (chunk.error) return fail(chunk.error.message);
      const data = (chunk.data || []) as BaseRow[];
      collected.push(...data);
      if (data.length < pageSize) break;
    }

    setSnapshotRowsCount(totalCount.count ?? collected.length);
    setMissingPaymentDates(missingCount.count ?? 0);
    setRows(collected);
    setSource(src);
    setSnapshotDate(snap);
    setLoading(false);
  }, [month, toast]);



  useEffect(() => { load(); }, [load]);

  const reloadMetabase = useCallback(async () => {
    setReloading(true);
    const isCurrent = month === currentMonthSP();
    const body = isCurrent ? {} : { backfill_mensal: true, mes: month };
    const { data, error } = await supabase.functions.invoke("ativos-ingest", { body });
    setReloading(false);
    if (error) {
      toast({ title: "Erro ao recarregar do Metabase", description: error.message, variant: "destructive" });
      return;
    }
    const result = data as { erro?: string; ativos?: number; gravados?: number; linhas_lidas?: number } | null;
    if (result?.erro) {
      toast({ title: "Ingestão retornou erro", description: result.erro, variant: "destructive" });
      return;
    }
    toast({
      title: isCurrent ? "Ingestão diária executada" : `Fotografia de ${month} recarregada`,
      description: result?.gravados != null ? `${result.gravados} linha(s) gravada(s).` : "Ingestão concluída.",
    });
    await load();
    onChanged();
  }, [month, toast, load, onChanged]);


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

  const payableRows = rows;
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

  const detailRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payableRows
      .filter((row) => detailFilter === "todos" || classificationKey(row.classificacao_company) === detailFilter)
      .filter((row) => !term || [row.company_id, row.email, row.plano, row.nome_oferta, row.stripe_price_id].some((value) => (value || "").toLowerCase().includes(term)))
      .sort((a, b) => (b.data_pagamento || "").localeCompare(a.data_pagamento || ""));
  }, [payableRows, detailFilter, search]);

  const exportBase = (kind: "csv" | "xlsx") => {

    const data = payableRows.map((row) => ({
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
      const csv = [headers, ...data.map((row) => headers.map((header) => String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')))].map((line) => line.map((value) => `"${value}"`).join(",")).join("\n");
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
  const relevantMissingMrr = payableRows.filter((row) => classificationKey(row.classificacao_company) === "upsell" && row.previous_mrr == null).length;
  const sourceLabel = source === "monthly" ? "Fotografia fechada" : "Snapshot diário mais recente";

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Base Metabase</h2>
          <p className="text-sm text-muted-foreground">Fonte oficial das conversões: Novos Pagantes, Recuperados e Upsell.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Mês da venda (Data Pagamento)</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" /></div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Atualizar base"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={reloadMetabase} disabled={reloading} title={`Recarregar do Metabase somente ${month}`}><DatabaseZap className={`h-4 w-4 ${reloading ? "animate-pulse" : ""}`} /> Recarregar Metabase ({month})</Button>

          <Button variant="outline" onClick={() => exportBase("csv")} disabled={loading || rows.length === 0}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" onClick={() => exportBase("xlsx")} disabled={loading || rows.length === 0}><FileSpreadsheet className="h-4 w-4" /> XLSX</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={source === "monthly" ? "default" : "secondary"}>{sourceLabel}</Badge>
        <span>Snapshot: {brDate(snapshotDate)}</span>
        <span>·</span><span>Fuso: São Paulo (UTC−3)</span>
        <span>·</span><span>{rows.length} de {snapshotRowsCount} linhas no mês</span>
      </div>

      {missingPaymentDates > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Data de pagamento ausente</AlertTitle><AlertDescription>{missingPaymentDates} linha(s) comissionável(is) da fotografia não têm Data Pagamento e ficam fora do recorte mensal. Recarregue a ingestão Metabase para preenchê-la.</AlertDescription></Alert>}
      {relevantMissingMrr > 0 && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Upsells sem Previous MRR</AlertTitle><AlertDescription>{relevantMissingMrr} linha(s) não podem gerar comissão de delta até a base Metabase ser recarregada com o MRR anterior.</AlertDescription></Alert>}
      {missingMap.length > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Price IDs sem de-para</AlertTitle><AlertDescription>{missingMap.length} Price ID(s) não estão no mapa de preços e aparecerão em “Sem vendedor” até a atribuição/correção do cadastro.</AlertDescription></Alert>}

      {loading ? <div className="py-12 text-center text-muted-foreground">Carregando fotografia...</div> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {COMMISSIONABLE_CLASSIFICATIONS.map((key) => {
            const value = metric(key);
            return <Card key={key}><CardHeader className="pb-2"><CardTitle className="text-sm">{classificationLabel(key)}</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{value.count}</div><p className="text-xs text-muted-foreground">{BRL(value.mrr)} em MRR</p></CardContent></Card>;
          })}
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-sm"><CalendarCheck className="h-4 w-4" /> Operações da fotografia</CardTitle><CardDescription>Feche ou refaça a referência do mês e recalcule as comissões da base Metabase. O recálculo grava o Mês da Venda = mês filtrado e o Mês de Pagamento = M+2.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => runAction("close")} disabled={running !== null}>{running === "close" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} {source === "monthly" ? "Refazer fotografia" : "Fechar fotografia"}</Button><Button onClick={() => runAction("reprocess")} disabled={running !== null || payableRows.length === 0}>{running === "reprocess" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Recalcular comissões</Button></div></CardHeader>
          <CardContent><div className="grid gap-3 text-sm md:grid-cols-3"><div className="rounded-md border p-3"><div className="text-muted-foreground">Linhas comissionáveis no mês</div><div className="text-xl font-semibold">{rows.length}</div></div><div className="rounded-md border p-3"><div className="text-muted-foreground">Linhas comissionáveis</div><div className="text-xl font-semibold">{payableRows.length}</div></div><div className="rounded-md border p-3"><div className="text-muted-foreground">MRR comissionável informado</div><div className="text-xl font-semibold">{BRL(payableRows.reduce((sum, row) => sum + Number(row.mrr || 0), 0))}</div></div></div></CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" /> Por vendedor</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{sellerRows.map((row) => <TableRow key={row.seller}><TableCell>{row.seller}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right tabular-nums">{BRL(row.mrr)}</TableCell></TableRow>)}{sellerRows.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Nenhuma conversão no período.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Wallet className="h-4 w-4" /> Por plano e Price ID</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Plano</TableHead><TableHead>Price ID</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{planRows.map((row) => <TableRow key={`${row.plan}-${row.priceId}`}><TableCell>{row.plan}</TableCell><TableCell className="max-w-48 truncate text-xs">{row.priceId}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right tabular-nums">{BRL(row.mrr)}</TableCell></TableRow>)}{planRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nenhuma conversão no período.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-sm">Clientes do mês (linha a linha)</CardTitle>
              <CardDescription>Novos Pagantes, Recuperados e Upsell com Data Pagamento em {month}.</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-wrap gap-1">
                {(["todos", "novo pagante", "recuperado", "upsell"] as const).map((key) => (
                  <Button key={key} size="sm" variant={detailFilter === key ? "default" : "outline"} onClick={() => setDetailFilter(key)}>
                    {key === "todos" ? "Todos" : classificationLabel(key)}
                  </Button>
                ))}
              </div>
              <Input placeholder="Buscar empresa, e-mail, plano ou Price ID" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full sm:w-72" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Pagto</TableHead><TableHead>Empresa</TableHead><TableHead>E-mail</TableHead><TableHead>Classificação</TableHead><TableHead>Plano / Oferta</TableHead><TableHead>Price ID</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">MRR anterior</TableHead><TableHead className="text-right">MRR</TableHead><TableHead className="text-right">Comissionável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((row) => {
                    const kind = classificationKey(row.classificacao_company);
                    const mrr = Number(row.mrr || 0);
                    const previous = row.previous_mrr == null ? null : Number(row.previous_mrr);
                    const base = kind === "upsell" ? (previous == null ? null : mrr - previous) : mrr;
                    return (
                      <TableRow key={`${row.id}-${row.company_id}`}>
                        <TableCell className="whitespace-nowrap tabular-nums">{brDate(row.data_pagamento)}</TableCell>
                        <TableCell className="font-mono text-xs">{row.company_id || "—"}</TableCell>
                        <TableCell className="max-w-56 truncate text-xs">{row.email || "—"}</TableCell>
                        <TableCell><Badge variant={kind === "upsell" ? "outline" : "secondary"}>{classificationLabel(row.classificacao_company)}</Badge></TableCell>
                        <TableCell className="max-w-48 truncate">{row.plano || row.nome_oferta || "—"}</TableCell>
                        <TableCell className="max-w-40 truncate font-mono text-xs">{row.stripe_price_id || "—"}</TableCell>
                        <TableCell>{sellerLabel(row.stripe_price_id ? priceById.get(row.stripe_price_id.trim().toLowerCase()) : undefined)}</TableCell>
                        <TableCell className="text-right tabular-nums">{previous == null ? "—" : BRL(previous)}</TableCell>
                        <TableCell className="text-right tabular-nums">{BRL(mrr)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{base == null ? "—" : BRL(base)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {detailRows.length === 0 && <TableRow><TableCell colSpan={10} className="py-6 text-center text-muted-foreground">Nenhum cliente no recorte.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{detailRows.length} linha(s) exibida(s).</p>
          </CardContent>
        </Card>


        {missingMap.length > 0 && <Card><CardHeader><CardTitle className="text-sm">Price IDs sem de-para</CardTitle><CardDescription>Cadastre o Price ID no Mapa de Preços para resolver vendedor, plano e regra de comissão.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Price ID</TableHead><TableHead>Plano</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">MRR</TableHead></TableRow></TableHeader><TableBody>{missingMap.map((row) => <TableRow key={row.priceId}><TableCell className="font-mono text-xs">{row.priceId}</TableCell><TableCell>{row.plan}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right tabular-nums">{BRL(row.mrr)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
      </>}
    </div>
  );
}
