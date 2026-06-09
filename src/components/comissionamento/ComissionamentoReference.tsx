import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  type CommissionReference,
  type PaymentType,
} from "@/lib/commissioning";

interface Props {
  reference: CommissionReference[];
  onChanged: () => void;
}

export function ComissionamentoReference({ reference, onChanged }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<CommissionReference> | null>(null);

  const filtered = reference.filter((r) =>
    !search || r.plan_name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async () => {
    if (!editing) return;
    const payload = {
      plan_name: editing.plan_name?.trim() || "",
      payment_type: editing.payment_type as PaymentType,
      plan_price: editing.plan_price ?? null,
      plan_mrr: editing.plan_mrr ?? null,
      commission_pct: Number(editing.commission_pct ?? 0),
      av_pct: editing.av_pct ?? null,
      is_active: editing.is_active ?? true,
    };
    if (!payload.plan_name || !payload.payment_type) {
      toast({ title: "Preencha plano e tipo", variant: "destructive" });
      return;
    }
    const { error } = editing.id
      ? await supabase.from("commission_reference").update(payload).eq("id", editing.id)
      : await supabase.from("commission_reference").insert(payload);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Salvo" });
    setEditing(null);
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta regra?")) return;
    const { error } = await supabase.from("commission_reference").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onChanged();
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-medium">Tabela de Referência de Comissão</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{reference.length} regras cadastradas</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar plano..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <Button onClick={() => setEditing({ payment_type: "mensal", commission_pct: 0.05, is_active: true })}>
            <Plus className="h-4 w-4 mr-1" /> Nova
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Plano</TableHead>
              <TableHead className="text-left">Tipo Pagamento</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead className="text-right">% Comissão</TableHead>
              <TableHead className="text-right">% AV</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-left">{r.plan_name}</TableCell>
                <TableCell className="text-left">{PAYMENT_TYPE_LABEL[r.payment_type]}</TableCell>
                <TableCell className="text-right tabular-nums">{r.plan_price?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.plan_mrr?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{(Number(r.commission_pct) * 100).toFixed(2)}%</TableCell>
                <TableCell className="text-right tabular-nums">{r.av_pct != null ? `${(Number(r.av_pct) * 100).toFixed(2)}%` : "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Nova"} regra de comissão</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Plano</Label>
                <Input value={editing.plan_name || ""} onChange={(e) => setEditing({ ...editing, plan_name: e.target.value })} />
              </div>
              <div>
                <Label>Tipo de Pagamento</Label>
                <Select value={editing.payment_type as string} onValueChange={(v) => setEditing({ ...editing, payment_type: v as PaymentType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((pt) => (<SelectItem key={pt} value={pt}>{PAYMENT_TYPE_LABEL[pt]}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Preço</Label>
                  <Input type="number" step="0.01" value={editing.plan_price ?? ""} onChange={(e) => setEditing({ ...editing, plan_price: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>MRR</Label>
                  <Input type="number" step="0.01" value={editing.plan_mrr ?? ""} onChange={(e) => setEditing({ ...editing, plan_mrr: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>% Comissão (0–1)</Label>
                  <Input type="number" step="0.001" value={editing.commission_pct ?? ""} onChange={(e) => setEditing({ ...editing, commission_pct: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>% AV (0–1)</Label>
                  <Input type="number" step="0.001" value={editing.av_pct ?? ""} onChange={(e) => setEditing({ ...editing, av_pct: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
