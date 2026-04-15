import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Clock, Wallet, FileText, FileSpreadsheet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { exportCommissionsPDF, exportCommissionsXLSX } from "@/lib/commissionExport";

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
  filterMonth: Date;
}

export function SellerCommissionView({ commissions, goals, wonMrr, loading, filterMonth }: Props) {
  const now = new Date();

  const filtered = useMemo(() => {
    return commissions.filter((c) => {
      const sd = new Date(c.sale_date);
      return sd.getFullYear() === filterMonth.getFullYear() && sd.getMonth() === filterMonth.getMonth();
    });
  }, [commissions, filterMonth]);

  const { provisioned, nextPayment, walletNext2 } = useMemo(() => {
    let prov = 0, next = 0, wallet = 0;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const month2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    for (const c of commissions) {
      if (c.status === "provisioned") {
        prov += c.commission_amount;
        const pm = new Date(c.payment_month);
        if (pm.getFullYear() === nextMonth.getFullYear() && pm.getMonth() === nextMonth.getMonth()) next += c.commission_amount;
        if (pm <= month2) wallet += c.commission_amount;
      }
    }
    return { provisioned: prov, nextPayment: next, walletNext2: wallet };
  }, [commissions]);

  const targetMrr = goals.reduce((s, g) => s + (g.target_mrr || 0), 0);
  const chartData = [{ name: "MRR", fechado: wonMrr, meta: targetMrr }];
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMonth = (d: string) => new Date(d).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  const monthLabel = filterMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const statusLabel: Record<string, string> = { provisioned: "Provisionado", paid: "Pago", reversed: "Estornado" };

  const buildExportRows = () =>
    filtered.map((c) => ({
      cliente: c.opportunity?.name || "—",
      empresa: c.opportunity?.company || "—",
      plano: c.product?.name || "—",
      mrr: c.opportunity?.estimated_mrr || 0,
      comissao: c.commission_amount,
      tipo: c.type,
      status: c.status,
      dataVenda: new Date(c.sale_date).toLocaleDateString("pt-BR"),
      mesGeracao: fmtMonth(c.sale_date),
      mesPagamento: fmtMonth(c.payment_month),
    }));

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;

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

      {/* Chart */}
      {targetMrr > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">MRR Fechado vs Meta</CardTitle></CardHeader>
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
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Extrato de Comissões</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => exportCommissionsPDF(buildExportRows(), "Comissões", monthLabel)} disabled={filtered.length === 0}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportCommissionsXLSX(buildExportRows(), "Comissões", monthLabel)} disabled={filtered.length === 0}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Data Venda</TableHead>
                <TableHead>Mês Geração MRR</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead>Mês Pagamento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma comissão neste mês</TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.opportunity?.name || "—"}</TableCell>
                  <TableCell>{new Date(c.sale_date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{fmtMonth(c.sale_date)}</TableCell>
                  <TableCell>{c.product?.name || "—"}</TableCell>
                  <TableCell className="text-right">{fmt(c.opportunity?.estimated_mrr || 0)}</TableCell>
                  <TableCell className={`text-right font-medium ${c.type === "clawback" ? "text-destructive" : ""}`}>
                    {c.type === "clawback" ? "-" : ""}{fmt(Math.abs(c.commission_amount))}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {fmtMonth(c.payment_month)}
                    </Badge>
                  </TableCell>
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
