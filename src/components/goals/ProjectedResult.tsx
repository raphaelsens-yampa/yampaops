import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Loader2 } from "lucide-react";
import { ORIGIN_OPTIONS, type OriginFilter } from "@/lib/origins";
import { computeProjectedResult, type ChurnCase } from "./projectedResultModel";
import { useProjectedResult } from "./useProjectedResult";
import {
  CHURN_COL_ORDER, DEFAULT_CHURN_SORT, churnDateBR, churnOrigins, churnSituations, churnTipos,
  filterChurnCases, sortChurnCases, type ChurnFilters, type ChurnSort, type ChurnSortKey,
} from "./churnCaseTable";

const ORDER_KEY = "goals.projetado.colOrder";
const HIDDEN_KEY = "goals.projetado.hiddenCols";

const COLS: Record<ChurnSortKey, { label: string; cls: string; right?: boolean }> = {
  email: { label: "Cliente", cls: "min-w-[220px]" },
  date: { label: "Data", cls: "w-[110px]" },
  tipo: { label: "Tipo", cls: "w-[120px]" },
  origin: { label: "Origem", cls: "w-[90px]" },
  mrr: { label: "MRR", cls: "w-[110px]", right: true },
  situacao: { label: "Situação", cls: "w-[160px]" },
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR");
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

const readList = (key: string): string[] | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "");
    return Array.isArray(stored) ? stored : null;
  } catch { return null; }
};

export function ProjectedResult() {
  const { data, loading, error } = useProjectedResult();
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const r = useMemo(() => (data ? computeProjectedResult(data.base, data.ops, data.churn, origin, data.recentSales, data.avgDays) : null), [data, origin]);

  const [sort, setSort] = useState<ChurnSort>(DEFAULT_CHURN_SORT);
  const [filters, setFilters] = useState<ChurnFilters>({});
  const [hiddenCols, setHiddenCols] = useState<string[]>(() => readList(HIDDEN_KEY) ?? []);
  const [colOrder, setColOrder] = useState<ChurnSortKey[]>(() => {
    const stored = readList(ORDER_KEY);
    if (stored) {
      const known = stored.filter((k): k is ChurnSortKey => CHURN_COL_ORDER.includes(k as ChurnSortKey));
      return [...known, ...CHURN_COL_ORDER.filter((k) => !known.includes(k))];
    }
    return CHURN_COL_ORDER;
  });
  const dragCol = useRef<ChurnSortKey | null>(null);

  const visible = colOrder.filter((k) => !hiddenCols.includes(k));
  const activeFilters = Object.values(filters).filter((x) => (x ?? "").trim()).length;
  const setFilter = (k: ChurnSortKey, v: string) => setFilters((p) => ({ ...p, [k]: v }));
  const toggleCol = (k: ChurnSortKey) => {
    setHiddenCols((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      return next;
    });
  };
  const moveCol = (from: ChurnSortKey | null, to: ChurnSortKey) => {
    if (!from || from === to) return;
    setColOrder((prev) => {
      const next = prev.filter((k) => k !== from);
      const idx = next.indexOf(to);
      if (idx === -1) return prev;
      next.splice(idx, 0, from);
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };
  const requestSort = (k: ChurnSortKey) =>
    setSort((prev) => (prev.key === k
      ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key: k, dir: k === "date" || k === "mrr" ? "desc" : "asc" }));
  const resetTable = () => {
    setHiddenCols([]);
    localStorage.removeItem(HIDDEN_KEY);
    setFilters({});
    setSort(DEFAULT_CHURN_SORT);
  };

  const rows = useMemo(
    () => (r ? sortChurnCases(filterChurnCases(r.churnCases, filters), sort) : []),
    [r, filters, sort],
  );
  const tipos = useMemo(() => churnTipos(r?.churnCases ?? []), [r]);
  const situations = useMemo(() => churnSituations(r?.churnCases ?? []), [r]);
  const origins = useMemo(() => churnOrigins(r?.churnCases ?? []), [r]);

  if (loading && !data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error && !data) return <p className="text-sm text-destructive">Não foi possível carregar: {error}</p>;
  if (!data || !r) return null;

  // Recuperação = realizado oficial do Metas Táticas; retenção não é MRR novo
  const saldo = r.projectedMrr - r.baseMrr;
  const bridge: [string, number, boolean][] = [
    [`Base oficial (${br(data.snapshot)})`, r.baseMrr, false],
    [`+ Novas vendas (${r.vendasQtd})`, r.vendasMrr, true],
    ["+ Upsell", r.upsellMrr, true],
    [`+ Novas vendas projetadas para ${br(data.tomorrow)} (média ${data.avgDays} dias úteis · ~${r.mediaVendasQtd}/dia)`, r.mediaVendasMrr, true],
    [`+ Recuperação (${r.recuperadosQtd})`, r.recuperadosMrr, true],
    ["− Downsell", -r.downsellMrr, true],
    [`− Churn previsto (${r.churnQtd})`, -r.churnMrr, true],
    ["= Saldo MRR", saldo, true],
  ];

  const headCell = (k: ChurnSortKey) => (
    <TableHead
      key={k}
      className={`${COLS[k].cls} cursor-pointer select-none`}
      onClick={() => requestSort(k)}
      draggable
      onDragStart={() => { dragCol.current = k; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => moveCol(dragCol.current, k)}
      title="Clique para ordenar · arraste para reordenar"
    >
      <div className={`flex items-center gap-1 ${COLS[k].right ? "justify-end" : "justify-center"}`}>
        {COLS[k].label}
        {sort.key === k
          ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}
      </div>
    </TableHead>
  );

  const filterCell = (k: ChurnSortKey) => {
    const raw = filters[k] ?? "";
    if (k === "tipo" || k === "origin" || k === "situacao") {
      const opts = k === "tipo" ? tipos : k === "origin" ? origins : situations;
      return (
        <TableHead key={k} className="px-1 py-1">
          <Select value={raw || "all"} onValueChange={(x) => setFilter(k, x === "all" ? "" : x)}>
            <SelectTrigger className="h-7 text-[11px] px-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {opts.map((o) => <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </TableHead>
      );
    }
    return (
      <TableHead key={k} className="px-1 py-1">
        <Input
          value={raw}
          onChange={(e) => setFilter(k, e.target.value)}
          placeholder={k === "date" ? "DD/MM" : k === "mrr" ? ">500" : "Filtrar"}
          className="h-7 text-[11px] px-2"
        />
      </TableHead>
    );
  };

  const bodyCell = (c: ChurnCase, k: ChurnSortKey) => {
    switch (k) {
      case "email": return <TableCell key={k} className="font-medium">{c.email}</TableCell>;
      case "date": return <TableCell key={k}>{churnDateBR(c.date)}</TableCell>;
      case "tipo": return <TableCell key={k} className="capitalize">{c.tipo}</TableCell>;
      case "origin": return <TableCell key={k}>{c.origin === "4blue" ? "4blue" : "Yampa"}</TableCell>;
      case "mrr": return <TableCell key={k} className="text-right tabular-nums">{brl(c.mrr)}</TableCell>;
      default: return (
        <TableCell key={k}>
          {c.avoided ? <Badge variant="secondary">{c.avoidedBy}</Badge> : <Badge variant="destructive">Churn</Badge>}
        </TableCell>
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-semibold">Resultado projetado para {br(data.tomorrow)}</h2>
          <p className="text-sm text-muted-foreground">Operações confirmadas desde {br(data.snapshot)} até hoje e churn previsto até amanhã.</p>
        </div>
        <Select value={origin} onValueChange={(v) => setOrigin(v as OriginFilter)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{ORIGIN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">MRR Total projetado</p>
          <p className="text-3xl font-heading font-bold">{brl(r.projectedMrr)}</p>
          <p className="text-sm text-muted-foreground">Atual {brl(r.baseMrr)} · <span className={r.projectedMrr >= r.baseMrr ? "text-primary" : "text-destructive"}>{signed(r.projectedMrr - r.baseMrr, brl)}</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Usuários projetados</p>
          <p className="text-3xl font-heading font-bold">{num(r.projectedUsers)}</p>
          <p className="text-sm text-muted-foreground">Atual {num(r.baseUsers)} · <span className={r.projectedUsers >= r.baseUsers ? "text-primary" : "text-destructive"}>{signed(r.projectedUsers - r.baseUsers, num)}</span></p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Da base atual ao projetado</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {bridge.map(([label, v, delta]) => (
            <div key={label} className="flex justify-between border-b border-border/50 pb-1">
              <span>{label}</span><span className="font-medium tabular-nums">{delta ? signed(v, brl) : brl(v)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 font-semibold"><span>MRR projetado</span><span className="tabular-nums">{brl(r.projectedMrr)}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Churn previsto até {br(data.tomorrow)}</CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3 className="h-3.5 w-3.5 mr-1.5" /> Colunas
                {hiddenCols.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({hiddenCols.length} ocultas)</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <p className="text-xs font-semibold px-1 pb-1">Mostrar colunas</p>
              {CHURN_COL_ORDER.map((c) => (
                <label key={c} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer rounded hover:bg-muted">
                  <Checkbox checked={!hiddenCols.includes(c)} onCheckedChange={() => toggleCol(c)} /> {COLS[c].label}
                </label>
              ))}
              {(hiddenCols.length > 0 || activeFilters > 0) && (
                <Button variant="ghost" size="sm" className="w-full h-7 mt-1 text-xs" onClick={resetTable}>
                  Mostrar tudo e limpar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent>
          {r.churnCases.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum churn previsto.</p> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>{visible.map(headCell)}</TableRow>
                  <TableRow className="hover:bg-transparent">{visible.map(filterCell)}</TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.email}>{visible.map((k) => bodyCell(c, k))}</TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
                <span>
                  {rows.length} de {r.churnCases.length} clientes
                  {activeFilters > 0 && ` · ${activeFilters} filtro(s) ativo(s)`}
                  {" · "}MRR {brl(rows.reduce((s, c) => s + c.mrr, 0))}
                </span>
                <span>Ordenado por {COLS[sort.key].label} ({sort.dir === "asc" ? "crescente" : "decrescente"}) · arraste o cabeçalho para mover a coluna</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
