import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRL, PAYMENT_TYPES, PAYMENT_TYPE_LABEL, formatMonthLabel } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";
import { CommissionMonthFilter } from "@/components/commissions/CommissionMonthFilter";
import { TrendingUp, DollarSign, Users, Calendar } from "lucide-react";

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

  const dateField: keyof ConversionRow = mode === "payment" ? "payment_month" : "sale_month";

  const filtered = useMemo(() => {
    return conversions.filter((c) => {
      const v = c[dateField] as string | null;
      if (!v) return false;
      const d = new Date(v);
      return d.getUTCFullYear() === month.getFullYear() && d.getUTCMonth() === month.getMonth();
    });
  }, [conversions, month, dateField]);

  const monthM1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthM2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const sumByPaymentMonth = (target: Date) =>
    conversions
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

  const getSellerName = (id: string | null, label: string | null) => {
    if (id) {
      const p = profiles.find((p) => p.user_id === id);
      if (p) return p.full_name || p.email || id;
    }
    return label || "—";
  };

  const sellerBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; mensal: number; anual_mensalizado: number; anual_avista: number; setup: number; total: number }>();
    for (const c of filtered) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const name = getSellerName(c.resolved_seller_user_id, c.resolved_seller_label);
      if (!map.has(key)) map.set(key, { name, mensal: 0, anual_mensalizado: 0, anual_avista: 0, setup: 0, total: 0 });
      const row = map.get(key)!;
      const pt = (c.resolved_payment_type || "mensal") as keyof typeof row;
      const amt = Number(c.commission_amount || 0);
      if (pt in row) (row as Record<string, number>)[pt] += amt;
      row.total += amt;
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
        <CommissionMonthFilter currentMonth={month} onMonthChange={setMonth} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
    </div>
  );
}
