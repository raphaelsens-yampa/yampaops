import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRL, PAYMENT_TYPE_LABEL, formatMonthLabel, type PaymentType, type PriceMapEntry } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";
import { CommissionMonthFilter } from "@/components/commissions/CommissionMonthFilter";
import { TrendingUp, DollarSign, Users, Calendar, Filter, ShoppingBag, Building2 } from "lucide-react";

interface Props {
  conversions: ConversionRow[];
  profiles: ProfileLite[];
  priceMap: PriceMapEntry[];
  isAdmin: boolean;
  loading: boolean;
}

type Mode = "payment" | "sale";

export function ComissionamentoOverview({ conversions, profiles, priceMap, isAdmin, loading }: Props) {
  const now = new Date();
  const [mode, setMode] = useState<Mode>("payment");
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedSeller, setSelectedSeller] = useState<string>("all");

  const getSellerName = (id: string | null, label: string | null) => {
    if (id) {
      const p = profiles.find((p) => p.user_id === id);
      if (p) return p.full_name || p.email || id;
    }
    return label || "—";
  };

  const areaByPriceId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of priceMap) {
      if (p.price_id && p.area) m.set(p.price_id.toLowerCase().trim(), p.area);
    }
    return m;
  }, [priceMap]);

  const areaOf = (c: ConversionRow) =>
    (c.price_id && areaByPriceId.get(c.price_id.toLowerCase().trim())) || "—";

  const sellers = useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    for (const c of conversions) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const name = getSellerName(c.resolved_seller_user_id, c.resolved_seller_label);
      if (!map.has(key)) map.set(key, { key, name });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [conversions, profiles]);

  const sellerFiltered = useMemo(() => {
    if (selectedSeller === "all") return conversions;
    return conversions.filter((c) => {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      return key === selectedSeller;
    });
  }, [conversions, selectedSeller]);

  const dateField: keyof ConversionRow = mode === "payment" ? "payment_month" : "sale_month";

  const filtered = useMemo(() => {
    return sellerFiltered.filter((c) => {
      const v = c[dateField] as string | null;
      if (!v) return false;
      const d = new Date(v);
      return d.getUTCFullYear() === month.getFullYear() && d.getUTCMonth() === month.getMonth();
    });
  }, [sellerFiltered, month, dateField]);

  const monthM1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthM2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const sumByPaymentMonth = (target: Date) =>
    sellerFiltered
      .filter((c) => {
        const d = new Date(c.payment_month);
        return d.getUTCFullYear() === target.getFullYear() && d.getUTCMonth() === target.getMonth();
      })
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0);

  const provM1 = sumByPaymentMonth(monthM1);
  const provM2 = sumByPaymentMonth(monthM2);

  const totalComissao = filtered.reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const totalMrr = filtered.reduce((s, c) => s + Number(c.mrr || 0), 0);
  const count = filtered.length;

  // Dynamic columns: plan × payment_type combos found in data
  const planTypeColumns = useMemo(() => {
    const set = new Map<string, { key: string; plan: string; pt: PaymentType | null }>();
    for (const c of filtered) {
      const plan = c.resolved_plan || "—";
      const pt = (c.resolved_payment_type as PaymentType | null) || null;
      const key = `${plan}||${pt || "—"}`;
      if (!set.has(key)) set.set(key, { key, plan, pt });
    }
    const arr = Array.from(set.values());
    arr.sort((a, b) => a.plan.localeCompare(b.plan) || (a.pt || "").localeCompare(b.pt || ""));
    return arr;
  }, [filtered]);

  const sellerPlanTypeBreakdown = useMemo(() => {
    type Row = { name: string; cells: Record<string, number>; total: number };
    const map = new Map<string, Row>();
    for (const c of filtered) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const name = getSellerName(c.resolved_seller_user_id, c.resolved_seller_label);
      if (!map.has(key)) map.set(key, { name, cells: {}, total: 0 });
      const row = map.get(key)!;
      const plan = c.resolved_plan || "—";
      const pt = (c.resolved_payment_type as PaymentType | null) || null;
      const colKey = `${plan}||${pt || "—"}`;
      const amt = Number(c.commission_amount || 0);
      row.cells[colKey] = (row.cells[colKey] || 0) + amt;
      row.total += amt;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, profiles]);

  const planColumns = useMemo(() => {
    const set = new Set<string>();
    for (const c of filtered) {
      if (c.resolved_plan) set.add(c.resolved_plan);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filtered]);

  // Vendas por Plano por Vendedor: count + MRR
  const planSellerBreakdown = useMemo(() => {
    type Row = { name: string; plans: Record<string, { count: number; mrr: number }>; totalCount: number; totalMrr: number };
    const map = new Map<string, Row>();
    for (const c of filtered) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const name = getSellerName(c.resolved_seller_user_id, c.resolved_seller_label);
      if (!map.has(key)) map.set(key, { name, plans: {}, totalCount: 0, totalMrr: 0 });
      const row = map.get(key)!;
      const plan = c.resolved_plan || "—";
      if (!row.plans[plan]) row.plans[plan] = { count: 0, mrr: 0 };
      row.plans[plan].count += 1;
      row.plans[plan].mrr += Number(c.mrr || 0);
      row.totalCount += 1;
      row.totalMrr += Number(c.mrr || 0);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCount - a.totalCount);
  }, [filtered, profiles]);

  // Vendas por Plano por Área
  const areaPlanBreakdown = useMemo(() => {
    type Row = { area: string; plans: Record<string, number>; total: number };
    const map = new Map<string, Row>();
    for (const c of filtered) {
      const area = areaOf(c);
      if (!map.has(area)) map.set(area, { area, plans: {}, total: 0 });
      const row = map.get(area)!;
      const plan = c.resolved_plan || "—";
      row.plans[plan] = (row.plans[plan] || 0) + 1;
      row.total += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, areaByPriceId]);

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  const modeLabel = mode === "payment" ? "Mês de Pagamento" : "Mês da Venda";

  return (
    <div className="space-y-4 sm:space-y-6 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="payment">Mês de Pagamento</TabsTrigger>
            <TabsTrigger value="sale">Mês da Venda</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Select value={selectedSeller} onValueChange={setSelectedSeller}>
              <SelectTrigger className="w-[220px]">
                <Filter className="h-4 w-4 mr-2 opacity-50" />
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <CommissionMonthFilter currentMonth={month} onMonthChange={setMonth} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Comissão</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold">{BRL(totalComissao)}</div>
            <p className="text-xs text-muted-foreground capitalize">{formatMonthLabel(month)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs sm:text-sm font-medium">MRR Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold">{BRL(totalMrr)}</div>
            <p className="text-xs text-muted-foreground">{count} conversões</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Vendas</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold">{count}</div>
            <p className="text-xs text-muted-foreground capitalize">{formatMonthLabel(month)}</p>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">A pagar (M+1)</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{BRL(provM1)}</div>
              <p className="text-xs text-muted-foreground capitalize">{formatMonthLabel(monthM1)}</p>
            </CardContent>
          </Card>
        )}
        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">A pagar (M+2)</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{BRL(provM2)}</div>
              <p className="text-xs text-muted-foreground capitalize">{formatMonthLabel(monthM2)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" /> Comissão por Vendedor · Plano · Periodicidade — {modeLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left sticky left-0 bg-background">Vendedor</TableHead>
                {planTypeColumns.map((col) => (
                  <TableHead key={col.key} className="text-right whitespace-nowrap">
                    <div className="font-medium">{col.plan}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {col.pt ? PAYMENT_TYPE_LABEL[col.pt] : "—"}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellerPlanTypeBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={planTypeColumns.length + 2} className="text-center text-muted-foreground py-8">
                    Nenhuma conversão neste mês.
                  </TableCell>
                </TableRow>
              )}
              {sellerPlanTypeBreakdown.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium text-left sticky left-0 bg-background">{s.name}</TableCell>
                  {planTypeColumns.map((col) => (
                    <TableCell key={col.key} className="text-right tabular-nums">
                      {s.cells[col.key] ? BRL(s.cells[col.key]) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-bold tabular-nums">{BRL(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Vendas por Plano por Área — {modeLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Área</TableHead>
                {planColumns.map((plan) => (
                  <TableHead key={plan} className="text-right">{plan}</TableHead>
                ))}
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {areaPlanBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={planColumns.length + 2} className="text-center text-muted-foreground py-8">
                    Nenhuma conversão neste mês.
                  </TableCell>
                </TableRow>
              )}
              {areaPlanBreakdown.map((a) => (
                <TableRow key={a.area}>
                  <TableCell className="font-medium text-left">{a.area}</TableCell>
                  {planColumns.map((plan) => (
                    <TableCell key={plan} className="text-right tabular-nums">
                      {a.plans[plan] || "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-bold tabular-nums">{a.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Vendas por Plano por Vendedor — {modeLabel}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Quantidade de vendas e MRR gerado por plano.</p>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left sticky left-0 bg-background" rowSpan={2}>Vendedor</TableHead>
                {planColumns.map((plan) => (
                  <TableHead key={plan} className="text-center border-l" colSpan={2}>{plan}</TableHead>
                ))}
                <TableHead className="text-center border-l font-bold" colSpan={2}>Total</TableHead>
              </TableRow>
              <TableRow>
                {planColumns.map((plan) => (
                  <>
                    <TableHead key={`${plan}-qty`} className="text-right border-l text-[11px] font-normal">Qtd</TableHead>
                    <TableHead key={`${plan}-mrr`} className="text-right text-[11px] font-normal">MRR</TableHead>
                  </>
                ))}
                <TableHead className="text-right border-l text-[11px] font-normal">Qtd</TableHead>
                <TableHead className="text-right text-[11px] font-normal">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planSellerBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={planColumns.length * 2 + 3} className="text-center text-muted-foreground py-8">
                    Nenhuma conversão neste mês.
                  </TableCell>
                </TableRow>
              )}
              {planSellerBreakdown.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium text-left sticky left-0 bg-background">{s.name}</TableCell>
                  {planColumns.map((plan) => {
                    const cell = s.plans[plan];
                    return (
                      <>
                        <TableCell key={`${plan}-qty`} className="text-right tabular-nums border-l">
                          {cell?.count || "—"}
                        </TableCell>
                        <TableCell key={`${plan}-mrr`} className="text-right tabular-nums text-xs text-muted-foreground">
                          {cell?.mrr ? BRL(cell.mrr) : "—"}
                        </TableCell>
                      </>
                    );
                  })}
                  <TableCell className="text-right font-bold tabular-nums border-l">{s.totalCount}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-xs">{BRL(s.totalMrr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
