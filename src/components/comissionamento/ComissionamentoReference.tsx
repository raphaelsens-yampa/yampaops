import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, Ticket } from "lucide-react";
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

const NO_COUPON = "__no_coupon__";

export function ComissionamentoReference({ reference, onChanged }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<CommissionReference> | null>(null);
  const [coupons, setCoupons] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    // Carrega cupons distintos vistos nas conversões pra popular o autocomplete
    (async () => {
      const { data } = await supabase
        .from("stripe_conversions")
        .select("coupon_id, coupon_name")
        .not("coupon_id", "is", null)
        .limit(1000);
      const seen = new Map<string, string | null>();
      (data || []).forEach((r: any) => {
        if (r.coupon_id && !seen.has(r.coupon_id)) seen.set(r.coupon_id, r.coupon_name);
      });
      setCoupons(Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));
    })();
  }, []);

  const filtered = reference.filter((r) =>
    !search || r.plan_name.toLowerCase().includes(search.toLowerCase()) || (r.coupon_id || "").toLowerCase().includes(search.toLowerCase()),
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
      coupon_id: editing.coupon_id?.trim() || null,
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

  const couponLabel = (id: string | null) => {
    if (!id) return null;
    const found = coupons.find((c) => c.id === id);
    return found?.name || id;
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-medium">Tabela de Referência de Comissão</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {reference.length} regras cadastradas. Regras com cupom têm prioridade sobre a regra padrão.
          </p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar plano ou cupom..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Button onClick={() => setEditing({ payment_type: "mensal", commission_pct: 0.05, is_active: true, coupon_id: null })}>
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
              <TableHead className="text-left">Cupom</TableHead>
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
                <TableCell className="text-left">
                  {r.coupon_id ? (
                    <Badge variant="outline" className="gap-1"><Ticket className="h-3 w-3" />{couponLabel(r.coupon_id)}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">— (padrão)</span>
                  )}
                </TableCell>
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
              <div>
                <Label>Cupom (opcional)</Label>
                <Select
                  value={editing.coupon_id || NO_COUPON}
                  onValueChange={(v) => setEditing({ ...editing, coupon_id: v === NO_COUPON ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COUPON}>— Sem cupom (regra padrão)</SelectItem>
                    {coupons.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name ? `${c.name} (${c.id})` : c.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se preenchido, essa regra só é aplicada quando o cupom estiver na conversão. Só o percentual muda — plano, periodicidade e vendedor continuam vindo do Mapa de Preços.
                </p>
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
