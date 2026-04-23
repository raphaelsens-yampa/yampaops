import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy } from "lucide-react";

export interface TeamRow {
  team_id: string;
  name: string;
  target: number;
  realized: number;
  topPerformer?: string;
}

const fmt = (v: number) => `R$ ${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

function statusBadge(pct: number) {
  if (pct >= 100) return <Badge className="bg-emerald-500 hover:bg-emerald-500">Bateu</Badge>;
  if (pct >= 70) return <Badge className="bg-amber-500 hover:bg-amber-500">No ritmo</Badge>;
  return <Badge variant="destructive">Abaixo</Badge>;
}

export function TeamRankingTable({ rows }: { rows: TeamRow[] }) {
  const ranked = [...rows].sort((a, b) => b.realized - a.realized);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acompanhamento por Equipe</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipe</TableHead>
              <TableHead className="text-right">Meta consolidada</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="w-[140px]">Progresso</TableHead>
              <TableHead>Top performer</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((r) => {
              const pct = r.target > 0 ? (r.realized / r.target) * 100 : 0;
              return (
                <TableRow key={r.team_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{fmt(r.target)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(r.realized)}</TableCell>
                  <TableCell className="text-right">{pct.toFixed(0)}%</TableCell>
                  <TableCell><Progress value={Math.min(pct, 100)} className="h-2" /></TableCell>
                  <TableCell className="text-sm">
                    {r.topPerformer ? (
                      <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-amber-500" />{r.topPerformer}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(pct)}</TableCell>
                </TableRow>
              );
            })}
            {ranked.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhuma equipe cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
