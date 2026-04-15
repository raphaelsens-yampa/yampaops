import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Clock, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Commission {
  id: string;
  opportunity_id: string;
  seller_id: string;
  product_id: string | null;
  sale_date: string;
  payment_month: string;
  commission_amount: number;
  type: string;
  status: string;
  created_at: string;
  opportunity?: { name: string; company: string | null; estimated_mrr: number | null };
  product?: { name: string } | null;
}

interface Props {
  commissions: Commission[];
  goals: { target_mrr: number | null }[];
  wonMrr: number;
  loading: boolean;
}

export function SellerCommissionView({ commissions, goals, wonMrr, loading }: Props) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { provisioned, nextPayment, walletNext2 } = useMemo(() => {
    let prov = 0;
    let next = 0;
    let wallet = 0;

    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const month2 = new Date(currentMonth);
    month2.setMonth(month2.getMonth() + 2);

    for (const c of commissions) {
      if (c.status === "provisioned") {
        prov += c.commission_amount;
        const pm = new Date(c.payment_month);
        if (pm.getFullYear() === nextMonth.getFullYear() && pm.getMonth() === nextMonth.getMonth()) {
          next += c.commission_amount;
        }
        if (pm <= month2) {
          wallet += c.commission_amount;
        }
      }
    }
    return { provisioned: prov, nextPayment: next, walletNext2: wallet };
  }, [commissions, currentMonth]);

  const targetMrr = goals.reduce((s, g) => s + (g.target_mrr || 0), 0);

  const chartData = [
    { name: "MRR", fechado: wonMrr, meta: targetMrr },
  ];

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusLabel: Record<string, string> = {
    provisioned: "Provisionado",
    paid: "Pago",
    reversed: "Estornado",
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo Provisionado</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(provisioned)}</div>
            <p className="text-xs text-muted-foreground">Comissões aguardando pagamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Próximo Recebimento</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(nextPayment)}</div>
            <p className="text-xs text-muted-foreground">Dia 10 do próximo mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Carteira a Receber</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(walletNext2)}</div>
            <p className="text-xs text-muted-foreground">Próximos 2 meses</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart MRR vs Meta */}
      {targetMrr > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">MRR Fechado vs Meta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="fechado" name="Fechado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="meta" name="Meta" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extrato */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Extrato de Comissões</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Data Venda</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Data Crédito</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma comissão registrada
                  </TableCell>
                </TableRow>
              )}
              {commissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.opportunity?.name || "—"}</TableCell>
                  <TableCell>{new Date(c.sale_date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{c.product?.name || "—"}</TableCell>
                  <TableCell className={`text-right font-medium ${c.type === "clawback" ? "text-destructive" : ""}`}>
                    {c.type === "clawback" ? "-" : ""}{fmt(Math.abs(c.commission_amount))}
                  </TableCell>
                  <TableCell>{new Date(c.payment_month).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "paid" ? "default" : c.status === "reversed" ? "destructive" : "secondary"}>
                      {statusLabel[c.status] || c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
