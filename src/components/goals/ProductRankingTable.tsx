import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface ProductRow {
  name: string;
  deals: number;
  mrr: number;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function ProductRankingTable({ rows }: { rows: ProductRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return [...list].sort((a, b) => b.mrr - a.mrr);
  }, [rows, query]);

  const totalDeals = filtered.reduce((s, r) => s + r.deals, 0);
  const totalMrr = filtered.reduce((s, r) => s + r.mrr, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">Vendas por Produto</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Conversões Stripe do período, agrupadas por produto/plano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar produto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-56"
          />
          <Badge variant="secondary">{filtered.length} produtos</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma conversão Stripe com produto identificado no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">MRR líquido</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.deals}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.mrr)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.deals > 0 ? fmtBRL(r.mrr / r.deals) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalDeals}</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalMrr)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {totalDeals > 0 ? fmtBRL(totalMrr / totalDeals) : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
