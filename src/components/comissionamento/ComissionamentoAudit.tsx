import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { saveAs } from "file-saver";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { useToast } from "@/hooks/use-toast";
import { BRL, type PriceMapEntry } from "@/lib/commissioning";

interface Props {
  priceMap: PriceMapEntry[];
}

type AuditRow = {
  id: number | string;
  data_snapshot: string;
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
  status_assinatura: string | null;
};

const COMMISSIONABLE = ["novo pagante", "recuperado", "upsell"];

const currentMonthSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
const nextMonthStart = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
};
const brDate = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const norm = (value: string | null | undefined) => (value || "").trim().toLowerCase();

/** Motivo canônico pelo qual a linha entrou ou não na apuração. */
export type AuditReason =
  | "incluido"
  | "assinatura_inativa"
  | "origem_nao_comissionavel"
  | "classificacao_nao_comissionavel"
  | "sem_data_pagamento"
  | "data_pagamento_fora_do_mes"
  | "upsell_sem_previous_mrr";

export const REASON_LABELS: Record<AuditReason, string> = {
  incluido: "Entrou na apuração",
  assinatura_inativa: "Ignorado: assinatura não ativa",
  origem_nao_comissionavel: "Ignorado: Origem Cliente não comissionável",
  classificacao_nao_comissionavel: "Ignorado: classificação não comissionável",
  sem_data_pagamento: "Ignorado: sem Data Pagamento",
  data_pagamento_fora_do_mes: "Ignorado: Data Pagamento fora do mês",
  upsell_sem_previous_mrr: "Ignorado: upsell sem MRR anterior",
};

/** Regra de elegibilidade — espelha a apuração (Base Metabase / Yampa comissionável). */
export function classifyAuditRow(
  row: Pick<AuditRow, "status_assinatura" | "origem_cliente" | "classificacao_company" | "data_pagamento" | "previous_mrr">,
  month: string,
): AuditReason {
  if (norm(row.status_assinatura) !== "ativo") return "assinatura_inativa";
  if (norm(row.origem_cliente) !== "yampa") return "origem_nao_comissionavel";
  const classification = norm(row.classificacao_company);
  if (!COMMISSIONABLE.includes(classification)) return "classificacao_nao_comissionavel";
  if (!row.data_pagamento) return "sem_data_pagamento";
  if (row.data_pagamento.slice(0, 7) !== month) return "data_pagamento_fora_do_mes";
  if (classification === "upsell" && row.previous_mrr == null) return "upsell_sem_previous_mrr";
  return "incluido";
}

/** Valor considerado na apuração: upsell comissiona apenas o delta. */
export function auditAmount(row: Pick<AuditRow, "classificacao_company" | "mrr" | "previous_mrr">): number {
  const mrr = Number(row.mrr || 0);
  if (norm(row.classificacao_company) === "upsell") return Math.max(0, mrr - Number(row.previous_mrr || 0));
  return mrr;
}

export function ComissionamentoAudit({ priceMap }: Props) {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonthSP());
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [source, setSource] = useState<"daily" | "monthly">("daily");
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reasonFilter, setReasonFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const priceById = useMemo(() => {
    const map = new Map<string, PriceMapEntry>();
    for (const item of priceMap) {
      const priceId = norm(item.price_id);
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
      toast({ title: "Erro ao carregar a auditoria", description: message, variant: "destructive" });
      setRows([]);
      setLoading(false);
    };

    // paged-ok: leitura de 1 linha para resolver qual fotografia usar
    const monthly = await supabase
      .from("metas_ativos_pagantes_monthly")
      .select("data_snapshot")
      .eq("mes_fechado", monthStart)
      .order("data_snapshot", { ascending: false })
      .limit(1);
    if (monthly.error) return fail(monthly.error.message);

    let table: "metas_ativos_pagantes_monthly" | "metas_ativos_pagantes_daily" = "metas_ativos_pagantes_monthly";
    let src: "daily" | "monthly" = "monthly";
    let snap: string | null = monthly.data?.[0]?.data_snapshot || null;

    if (!snap) {
      table = "metas_ativos_pagantes_daily";
      src = "daily";
      // paged-ok: leitura de 1 linha para resolver a fotografia diária
      let dateQuery = supabase
        .from("metas_ativos_pagantes_daily")
        .select("data_snapshot")
        .order("data_snapshot", { ascending: false })
        .limit(1);
      if (!isCurrent) dateQuery = dateQuery.gte("data_snapshot", monthStart).lt("data_snapshot", monthEnd);
      const daily = await dateQuery;
      if (daily.error) return fail(daily.error.message);
      snap = daily.data?.[0]?.data_snapshot || null;
    }

    if (!snap) {
      setRows([]);
      setSource(src);
      setSnapshotDate(null);
      setLoading(false);
      return;
    }

    // Fotografia COMPLETA do mês (sem filtros) — a auditoria precisa dos ignorados também.
    const paged = await fetchAllPaged<AuditRow>(() => {
      let q = (supabase.from(table) as never as ReturnType<typeof supabase.from>)
        .select(
          "id, data_snapshot, company_id, email, plano, nome_oferta, stripe_price_id, mrr, previous_mrr, data_pagamento, classificacao_company, origem_cliente, status_assinatura",
        )
        .eq("data_snapshot", snap as string)
        .order("data_pagamento", { ascending: false, nullsFirst: false })
        .order("id");
      if (table === "metas_ativos_pagantes_monthly") q = q.eq("mes_fechado", monthStart);
      return q as never;
    });
    if (paged.error) return fail(paged.error);

    setRows(paged.data);
    setSource(src);
    setSnapshotDate(snap);
    setLoading(false);
  }, [month, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const classified = useMemo(
    () => rows.map((row) => ({ row, reason: classifyAuditRow(row, month) })),
    [rows, month],
  );

  const totals = useMemo(() => {
    const map = new Map<AuditReason, { count: number; mrr: number }>();
    for (const { row, reason } of classified) {
      const current = map.get(reason) || { count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += reason === "incluido" ? auditAmount(row) : Number(row.mrr || 0);
      map.set(reason, current);
    }
    return map;
  }, [classified]);

  const included = totals.get("incluido") || { count: 0, mrr: 0 };
  const ignoredCount = classified.length - included.count;
  const originIgnored = totals.get("origem_nao_comissionavel") || { count: 0, mrr: 0 };
  const reconciles = included.count + ignoredCount === classified.length;

  const withoutSeller = useMemo(
    () =>
      classified.filter(
        ({ row, reason }) => reason === "incluido" && !priceById.get(norm(row.stripe_price_id))?.seller_user_id,
      ).length,
    [classified, priceById],
  );

  const originBreakdown = useMemo(() => {
    const map = new Map<string, { origin: string; count: number; mrr: number }>();
    for (const { row } of classified) {
      const origin = norm(row.origem_cliente) || "(sem origem)";
      const current = map.get(origin) || { origin, count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += Number(row.mrr || 0);
      map.set(origin, current);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [classified]);

  const detail = useMemo(() => {
    const term = search.trim().toLowerCase();
    return classified
      .filter(({ reason }) => reasonFilter === "todos" || reason === reasonFilter)
      .filter(({ row }) =>
        !term ||
        [row.company_id, row.email, row.plano, row.nome_oferta, row.stripe_price_id].some((value) =>
          (value || "").toLowerCase().includes(term),
        ),
      );
  }, [classified, reasonFilter, search]);

  const exportCsv = () => {
    const data = detail.map(({ row, reason }) => ({
      Situação: REASON_LABELS[reason],
      Empresa: row.company_id || "",
      Email: row.email || "",
      "Origem Cliente": row.origem_cliente || "",
      Status: row.status_assinatura || "",
      Classificação: row.classificacao_company || "",
      Plano: row.plano || row.nome_oferta || "",
      "Price ID": row.stripe_price_id || "",
      MRR: Number(row.mrr || 0),
      "Previous MRR": row.previous_mrr == null ? "" : Number(row.previous_mrr),
      "Valor apurado": reason === "incluido" ? auditAmount(row) : 0,
      "Data Pagamento": row.data_pagamento || "",
      "Data fotografia": row.data_snapshot,
    }));
    const headers = Object.keys(data[0] || { Auditoria: "" });
    const csv = [headers, ...data.map((line) => headers.map((header) => String(line[header as keyof typeof line] ?? "")))]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    saveAs(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `auditoria_apuracao_${month}.csv`);
    toast({ title: "Exportação concluída", description: `${data.length} linha(s) exportada(s).` });
  };

  const reasonOrder: AuditReason[] = [
    "incluido",
    "origem_nao_comissionavel",
    "classificacao_nao_comissionavel",
    "assinatura_inativa",
    "sem_data_pagamento",
    "data_pagamento_fora_do_mes",
    "upsell_sem_previous_mrr",
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Auditoria da apuração</h2>
          <p className="text-sm text-muted-foreground">
            O que entrou (Yampa comissionável) e o que foi ignorado por Origem Cliente ou outro motivo, com totais conferíveis.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Mês</Label>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-[150px]" />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Recarregar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={detail.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{source === "monthly" ? "Fotografia fechada" : "Snapshot diário mais recente"}</Badge>
        <span>Fotografia: {brDate(snapshotDate)}</span>
        <span>·</span>
        <span>{classified.length} linha(s) na fotografia</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entraram na apuração</CardDescription>
            <CardTitle className="text-2xl">{included.count}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{BRL(included.mrr)} apurados</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ignorados</CardDescription>
            <CardTitle className="text-2xl">{ignoredCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">de {classified.length} linhas lidas</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ignorados por Origem Cliente</CardDescription>
            <CardTitle className="text-2xl">{originIgnored.count}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{BRL(originIgnored.mrr)} fora da apuração</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Incluídos sem vendedor mapeado</CardDescription>
            <CardTitle className="text-2xl">{withoutSeller}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">exigem atribuição manual</CardContent>
        </Card>
      </div>

      <Alert variant={reconciles ? "default" : "destructive"}>
        {reconciles ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        <AlertTitle>{reconciles ? "Totais conferem" : "Divergência na conferência"}</AlertTitle>
        <AlertDescription>
          {included.count} incluídos + {ignoredCount} ignorados = {included.count + ignoredCount} de {classified.length} linhas
          da fotografia de {brDate(snapshotDate)}.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conferência por motivo</CardTitle>
            <CardDescription>Cada linha da fotografia cai em exatamente um motivo.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reasonOrder.map((reason) => {
                  const value = totals.get(reason) || { count: 0, mrr: 0 };
                  return (
                    <TableRow key={reason}>
                      <TableCell>{REASON_LABELS[reason]}</TableCell>
                      <TableCell className="text-right">{value.count}</TableCell>
                      <TableCell className="text-right">{BRL(value.mrr)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold">
                  <TableCell>Total lido</TableCell>
                  <TableCell className="text-right">{classified.length}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por Origem Cliente</CardTitle>
            <CardDescription>Somente a origem "yampa" é comissionável.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Comissionável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {originBreakdown.map((item) => (
                  <TableRow key={item.origin}>
                    <TableCell className="capitalize">{item.origin}</TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right">{BRL(item.mrr)}</TableCell>
                    <TableCell className="text-right">
                      {item.origin === "yampa" ? <Badge variant="outline">Sim</Badge> : <Badge variant="secondary">Não</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {originBreakdown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Sem dados na fotografia.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Registros linha a linha</CardTitle>
            <CardDescription>{detail.length} linha(s) no filtro atual.</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Situação</Label>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {reasonOrder.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {REASON_LABELS[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Buscar</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Empresa, email, plano, price id"
                className="w-[240px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Situação</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Apurado</TableHead>
                <TableHead>Data Pagto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                detail.slice(0, 500).map(({ row, reason }) => (
                  <TableRow key={`${row.id}`}>
                    <TableCell>
                      <Badge variant={reason === "incluido" ? "outline" : "secondary"}>{REASON_LABELS[reason]}</Badge>
                    </TableCell>
                    <TableCell>{row.company_id || row.email || "—"}</TableCell>
                    <TableCell className="capitalize">{row.origem_cliente || "—"}</TableCell>
                    <TableCell className="capitalize">{row.classificacao_company || "—"}</TableCell>
                    <TableCell>{row.plano || row.nome_oferta || "—"}</TableCell>
                    <TableCell className="text-right">{BRL(Number(row.mrr || 0))}</TableCell>
                    <TableCell className="text-right">{reason === "incluido" ? BRL(auditAmount(row)) : "—"}</TableCell>
                    <TableCell>{brDate(row.data_pagamento)}</TableCell>
                  </TableRow>
                ))}
              {!loading && detail.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhum registro no filtro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {detail.length > 500 && (
            <p className="p-3 text-xs text-muted-foreground">
              Exibindo as primeiras 500 linhas — use a exportação CSV para a lista completa ({detail.length}).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
