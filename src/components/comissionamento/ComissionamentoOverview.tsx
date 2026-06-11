import { useMemo, useState } from "react";
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
import { BRL, PAYMENT_TYPES, PAYMENT_TYPE_LABEL, formatMonthLabel } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";
import { CommissionMonthFilter } from "@/components/commissions/CommissionMonthFilter";
import { TrendingUp, DollarSign, Users, Calendar, Filter, ShoppingBag } from "lucide-react";

interface Props {
  conversions: ConversionRow[];
  profiles: ProfileLite[];
  isAdmin: boolean;
  loading: boolean;
}

type Mode = "payment" | "sale";

export function ComissionamentoOverview({ conversions, profiles, isAdmin, loading }: Props) {
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

  const sellerBreakdown = useMemo(() => {
    type Row = { name: string; mensal: number; anual_mensalizado: number; anual_avista: number; setup: number; total: number };
    const map = new Map<string, Row>();
    for (const c of filtered) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const name = getSellerName(c.resolved_seller_user_id, c.resolved_seller_label);
      if (!map.has(key)) map.set(key, { name, mensal: 0, anual_mensalizado: 0, anual_avista: 0, setup: 0, total: 0 });
      const row = map.get(key)!;
      const pt = c.resolved_payment_type as "mensal" | "anual_mensalizado" | "anual_avista" | "setup" | null;
      const amt = Number(c.commission_amount || 0);
      if (pt && pt in row) row[pt] += amt;
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

  const planSellerCountBreakdown = useMemo(() => {
    type Row = { name: string; plans: Record<string, number>; total: number };
    const map = new Map<string, Row>();
    for (const c of filtered) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const name = getSellerName(c.resolved_seller_user_id, c.resolved_seller_label);
      if (!map.has(key)) map.set(key, { name, plans: {}, total: 0 });
      const row = map.get(key)!;
      const plan = c.resolved_plan || "—";
      row.plans[plan] = (row.plans[plan] || 0) + 1;
      row.total += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, profiles]);

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

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
            <Users className="h-4 w-4" /> Comissão por Vendedor — {mode === "payment" ? "Mês de Pagamento" : "Mês da Venda"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Vendedor</TableHead>
                {PAYMENT_TYPES.map((pt) => (
                  <TableHead key={pt} className="text-right">{PAYMENT_TYPE_LABEL[pt]}</TableHead>
                ))}
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellerBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={PAYMENT_TYPES.length + 2} className="text-center text-muted-foreground py-8">
                    Nenhuma conversão neste mês.
                  </TableCell>
                </TableRow>
              )}
              {sellerBreakdown.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium text-left">{s.name}</TableCell>
                  {PAYMENT_TYPES.map((pt) => (
                    <TableCell key={pt} className="text-right tabular-nums">
                      {s[pt] > 0 ? BRL(s[pt]) : "—"}
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
            <ShoppingBag className="h-4 w-4" /> Vendas por Plano por Vendedor — {mode === "payment" ? "Mês de Pagamento" : "Mês da Venda"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Vendedor</TableHead>
                {planColumns.map((plan) => (
                  <TableHead key={plan} className="text-right">{plan}</TableHead>
                ))}
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planSellerCountBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={planColumns.length + 2} className="text-center text-muted-foreground py-8">
                    Nenhuma conversão neste mês.
                  </TableCell>
                </TableRow>
              )}
              {planSellerCountBreakdown.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium text-left">{s.name}</TableCell>
                  {planColumns.map((plan) => (
                    <TableCell key={plan} className="text-right tabular-nums">
                      {s.plans[plan] || "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-bold tabular-nums">{s.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
