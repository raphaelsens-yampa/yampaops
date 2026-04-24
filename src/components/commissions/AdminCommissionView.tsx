import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { TrendingUp, AlertTriangle, FileText, FileSpreadsheet } from "lucide-react";
import { exportCommissionsPDF, exportCommissionsXLSX } from "@/lib/commissionExport";

interface Commission {
  id: string;
  seller_id: string;
  commission_amount: number;
  type: string;
  status: string;
  sale_date: string;
  payment_month: string;
  opportunity?: { name: string; company: string | null; origin: string; estimated_mrr: number | null };
  product?: { name: string } | null;
}

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  commissions: Commission[];
  profiles: Profile[];
  loading: boolean;
  filterMonth: Date;
}

export function AdminCommissionView({ commissions, profiles, loading, filterMonth }: Props) {
  const now = new Date();

  const filtered = useMemo(() => {
    return commissions.filter((c) => {
      const sd = new Date(c.sale_date);
      return sd.getFullYear() === filterMonth.getFullYear() && sd.getMonth() === filterMonth.getMonth();
    });
  }, [commissions, filterMonth]);

  const { provM1, provM2, channelRanking, sellerTotals } = useMemo(() => {
    const m1 = new Date(filterMonth.getFullYear(), filterMonth.getMonth() + 1, 1);
    const m2 = new Date(filterMonth.getFullYear(), filterMonth.getMonth() + 2, 1);
    let pm1 = 0, pm2 = 0;
    const channels: Record<string, { commission: number; mrr: number }> = {};
    const sellers: Record<string, { earned: number; clawback: number }> = {};

    // Provisão olha TODAS as comissões (não só do mês selecionado), filtrando pelo payment_month
    // M+1 = desembolsos do próximo mês; M+2 = desembolsos em 2 meses
    for (const c of commissions) {
      if (c.status === "provisioned") {
        const pm = new Date(c.payment_month);
        if (pm.getUTCFullYear() === m1.getFullYear() && pm.getUTCMonth() === m1.getMonth()) pm1 += c.commission_amount;
        if (pm.getUTCFullYear() === m2.getFullYear() && pm.getUTCMonth() === m2.getMonth()) pm2 += c.commission_amount;
      }
    }

    for (const c of filtered) {
      const origin = c.opportunity?.origin || "outros";
      if (!channels[origin]) channels[origin] = { commission: 0, mrr: 0 };
      if (c.type === "earned") {
        channels[origin].commission += c.commission_amount;
        channels[origin].mrr += c.opportunity?.estimated_mrr || 0;
      }
      if (!sellers[c.seller_id]) sellers[c.seller_id] = { earned: 0, clawback: 0 };
      if (c.type === "earned") sellers[c.seller_id].earned += c.commission_amount;
      else sellers[c.seller_id].clawback += c.commission_amount;
    }

    return {
      provM1: pm1, provM2: pm2,
      channelRanking: Object.entries(channels).map(([k, v]) => ({ origin: k, ...v })).sort((a, b) => b.mrr - a.mrr),
      sellerTotals: Object.entries(sellers).map(([id, v]) => {
        const p = profiles.find((p) => p.user_id === id);
        return { id, name: p?.full_name || p?.email || id, ...v, net: v.earned - v.clawback };
      }).sort((a, b) => b.net - a.net),
    };
  }, [filtered, commissions, profiles, filterMonth]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMonth = (d: string) => new Date(d).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  const monthLabel = filterMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const statusLabel: Record<string, string> = { provisioned: "Provisionado", paid: "Pago", reversed: "Estornado" };

  const getSellerName = (id: string) => {
    const p = profiles.find((p) => p.user_id === id);
    return p?.full_name || p?.email || id;
  };

  const buildExportRows = () =>
    filtered.map((c) => ({
      cliente: c.opportunity?.name || "—",
      empresa: c.opportunity?.company || "—",
      vendedor: getSellerName(c.seller_id),
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
      {/* Provisão */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Provisão M+1</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(provM1)}</div>
            <p className="text-xs text-muted-foreground">Desembolso no próximo mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Provisão M+2</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(provM2)}</div>
            <p className="text-xs text-muted-foreground">Desembolso em 2 meses</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Ranking de Canais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Comissão Total</TableHead>
                <TableHead className="text-right">MRR Gerado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channelRanking.map((ch) => (
                <TableRow key={ch.origin}>
                  <TableCell className="font-medium">{ORIGIN_LABELS[ch.origin] || ch.origin}</TableCell>
                  <TableCell className="text-right">{fmt(ch.commission)}</TableCell>
                  <TableCell className="text-right">{fmt(ch.mrr)}</TableCell>
                </TableRow>
              ))}
              {channelRanking.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Seller Totals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Comissões por Vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Ganho</TableHead>
                <TableHead className="text-right">Estorno</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellerTotals.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right">{fmt(s.earned)}</TableCell>
                  <TableCell className="text-right text-destructive">{fmt(s.clawback)}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(s.net)}</TableCell>
                </TableRow>
              ))}
              {sellerTotals.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Extrato Detalhado */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Extrato Detalhado</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => exportCommissionsPDF(buildExportRows(), "Comissões Gerencial", monthLabel)} disabled={filtered.length === 0}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportCommissionsXLSX(buildExportRows(), "Comissões Gerencial", monthLabel)} disabled={filtered.length === 0}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
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
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma comissão neste mês</TableCell></TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{getSellerName(c.seller_id)}</TableCell>
                  <TableCell>{c.opportunity?.name || "—"}</TableCell>
                  <TableCell>{new Date(c.sale_date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{fmtMonth(c.sale_date)}</TableCell>
                  <TableCell>{c.product?.name || "—"}</TableCell>
                  <TableCell className="text-right">{fmt(c.opportunity?.estimated_mrr || 0)}</TableCell>
                  <TableCell className={`text-right font-medium ${c.type === "clawback" ? "text-destructive" : ""}`}>
                    {c.type === "clawback" ? "-" : ""}{fmt(Math.abs(c.commission_amount))}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">{fmtMonth(c.payment_month)}</Badge>
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
