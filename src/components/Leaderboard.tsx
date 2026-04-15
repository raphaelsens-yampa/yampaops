import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";

interface SellerStats {
  name: string;
  deals_won: number;
  mrr_won: number;
  contacts: number;
  meetings: number;
}

interface Props {
  sellers: SellerStats[];
}

export function Leaderboard({ sellers }: Props) {
  const sorted = [...sellers].sort((a, b) => b.mrr_won - a.mrr_won);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-warning" /> Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Deals</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead className="text-right">Contatos</TableHead>
              <TableHead className="text-right">Reuniões</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s, i) => (
              <TableRow key={s.name}>
                <TableCell className="font-medium">{i + 1}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-right">{s.deals_won}</TableCell>
                <TableCell className="text-right">R$ {s.mrr_won.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">{s.contacts}</TableCell>
                <TableCell className="text-right">{s.meetings}</TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
