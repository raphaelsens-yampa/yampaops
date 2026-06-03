import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { fmtBRL, sumCosts } from "@/lib/pricing/engine";
import type { PricingSnapshot, CostItem } from "@/lib/pricing/types";

interface Props {
  title: string;
  field: "fixed_costs" | "labor_costs";
  snap: PricingSnapshot;
  update: (u: (s: PricingSnapshot) => PricingSnapshot) => void;
}

export function CostListEditor({ title, field, snap, update }: Props) {
  const items = snap[field];
  const total = sumCosts(items);

  const setItems = (next: CostItem[]) =>
    update((s) => ({ ...s, [field]: next } as PricingSnapshot));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Total mensal: {fmtBRL(total)}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setItems([...items, { description: "", amount: 0 }])}
        >
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-40">Valor (R$ / mês)</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Input
                    value={it.description}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], description: e.target.value };
                      setItems(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    value={it.amount}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], amount: Number(e.target.value) };
                      setItems(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Nenhum item. Clique em "Adicionar".
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
