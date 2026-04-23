import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface SellerRow {
  user_id: string;
  name: string;
  target: number;
  realized: number;
}

const fmt = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

function statusBadge(pct: number) {
  if (pct >= 100) return <Badge className="bg-emerald-500 hover:bg-emerald-500">Bateu meta</Badge>;
  if (pct >= 70) return <Badge className="bg-amber-500 hover:bg-amber-500">No ritmo</Badge>;
  return <Badge variant="destructive">Abaixo</Badge>;
}

export function SellerRankingTable({ rows }: { rows: SellerRow[] }) {
  const ranked = [...rows].sort((a, b) => b.realized - a.realized);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranking por Vendedor</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Gap</TableHead>
              <TableHead className="w-[140px]">Progresso</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((r, i) => {
              const pct = r.target > 0 ? (r.realized / r.target) * 100 : 0;
              const gap = r.target - r.realized;
              return (
                <TableRow key={r.user_id}>
                  <TableCell className="font-bold text-muted-foreground">{i + 1}º</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{fmt(r.target)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(r.realized)}</TableCell>
                  <TableCell className="text-right">{pct.toFixed(0)}%</TableCell>
                  <TableCell className="text-right text-sm">{gap > 0 ? fmt(gap) : <span className="text-emerald-500">✓</span>}</TableCell>
                  <TableCell><Progress value={Math.min(pct, 100)} className="h-2" /></TableCell>
                  <TableCell>{statusBadge(pct)}</TableCell>
                </TableRow>
              );
            })}
            {ranked.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhum vendedor no escopo</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
