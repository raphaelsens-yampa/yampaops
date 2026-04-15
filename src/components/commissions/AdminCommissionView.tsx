import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORIGIN_LABELS } from "@/lib/constants";
import { TrendingUp, AlertTriangle } from "lucide-react";

interface Commission {
  id: string;
  seller_id: string;
  commission_amount: number;
  type: string;
  status: string;
  payment_month: string;
  opportunity?: { name: string; origin: string; estimated_mrr: number | null };
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
}

export function AdminCommissionView({ commissions, profiles, loading }: Props) {
  const now = new Date();

  const { provM1, provM2, channelRanking, sellerTotals } = useMemo(() => {
    const m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const m2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    let pm1 = 0, pm2 = 0;
    const channels: Record<string, { commission: number; mrr: number }> = {};
    const sellers: Record<string, { earned: number; clawback: number }> = {};

    for (const c of commissions) {
      const pm = new Date(c.payment_month);
      if (c.status === "provisioned") {
        if (pm.getFullYear() === m1.getFullYear() && pm.getMonth() === m1.getMonth()) pm1 += c.commission_amount;
        if (pm.getFullYear() === m2.getFullYear() && pm.getMonth() === m2.getMonth()) pm2 += c.commission_amount;
      }

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

    const channelRanking = Object.entries(channels)
      .map(([k, v]) => ({ origin: k, ...v }))
      .sort((a, b) => b.mrr - a.mrr);

    const sellerTotals = Object.entries(sellers)
      .map(([id, v]) => {
        const p = profiles.find((p) => p.user_id === id);
        return { id, name: p?.full_name || p?.email || id, ...v, net: v.earned - v.clawback };
      })
      .sort((a, b) => b.net - a.net);

    return { provM1: pm1, provM2: pm2, channelRanking, sellerTotals };
  }, [commissions, profiles]);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

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
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem dados</TableCell>
                </TableRow>
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
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
