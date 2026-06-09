import { useState, useMemo } from "react";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  type CommissionReference,
  type PriceMapEntry,
  type PaymentType,
} from "@/lib/commissioning";
import type { ProfileLite } from "@/pages/Comissionamento";

interface Props {
  priceMap: PriceMapEntry[];
  reference: CommissionReference[];
  profiles: ProfileLite[];
  onChanged: () => void;
}

export function ComissionamentoPriceMap({ priceMap, reference, profiles, onChanged }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<PriceMapEntry> | null>(null);

  const planNames = useMemo(() => Array.from(new Set(reference.map((r) => r.plan_name))).sort(), [reference]);

  const filtered = priceMap.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.price_id || "").toLowerCase().includes(q) ||
      (m.offer_name || "").toLowerCase().includes(q) ||
      (m.price_name || "").toLowerCase().includes(q) ||
      (m.plan_name || "").toLowerCase().includes(q) ||
      (m.seller_label || "").toLowerCase().includes(q)
    );
  });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.price_id && !editing.offer_name) {
      toast({ title: "Informe Price ID ou Nome da Oferta", variant: "destructive" });
      return;
    }
    const payload = {
      price_id: editing.price_id?.trim() || null,
      offer_name: editing.offer_name?.trim() || null,
      price_name: editing.price_name?.trim() || null,
      plan_name: editing.plan_name?.trim() || null,
      payment_type: editing.payment_type as PaymentType | null,
      area: editing.area || "Sales",
      seller_user_id: editing.seller_user_id || null,
      seller_label: editing.seller_label || null,
      mrr_override: editing.mrr_override ?? null,
    };
    const { error } = editing.id
      ? await supabase.from("commission_price_map").update(payload).eq("id", editing.id)
      : await supabase.from("commission_price_map").insert(payload);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Salvo" });
    setEditing(null);
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este mapeamento?")) return;
    const { error } = await supabase.from("commission_price_map").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onChanged();
  };

  const sellerName = (m: PriceMapEntry) => {
    if (m.seller_user_id) {
      const p = profiles.find((p) => p.user_id === m.seller_user_id);
      if (p) return p.full_name || p.email;
    }
    return m.seller_label || "—";
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-medium">Mapa de Preços</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{priceMap.length} entradas — relaciona Price ID/Oferta com plano e vendedor</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          <Button onClick={() => setEditing({ payment_type: "mensal", area: "Sales" })}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Price ID / Oferta</TableHead>
              <TableHead className="text-left">Nome</TableHead>
              <TableHead className="text-left">Plano</TableHead>
              <TableHead className="text-left">Tipo</TableHead>
              <TableHead className="text-left">Vendedor</TableHead>
              <TableHead className="text-right">MRR Override</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 300).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-left">
                  {m.price_id ? <code className="text-xs">{m.price_id}</code> : <Badge variant="outline">Oferta: {m.offer_name}</Badge>}
                </TableCell>
                <TableCell className="text-left text-xs max-w-[260px] truncate">{m.price_name}</TableCell>
                <TableCell className="text-left">{m.plan_name || <span className="text-destructive">—</span>}</TableCell>
                <TableCell className="text-left">{m.payment_type ? PAYMENT_TYPE_LABEL[m.payment_type] : "—"}</TableCell>
                <TableCell className="text-left">{sellerName(m)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.mrr_override?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 300 && (
          <div className="text-center text-xs text-muted-foreground py-3">
            Mostrando 300 de {filtered.length} — refine a busca.
          </div>
        )}
      </CardContent>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing.id ? "Editar" : "Novo"} mapeamento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price ID</Label>
                  <Input value={editing.price_id || ""} onChange={(e) => setEditing({ ...editing, price_id: e.target.value })} placeholder="price_..." />
                </div>
                <div>
                  <Label>Nome Oferta (fallback)</Label>
                  <Input value={editing.offer_name || ""} onChange={(e) => setEditing({ ...editing, offer_name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Nome do Price (rótulo)</Label>
                <Input value={editing.price_name || ""} onChange={(e) => setEditing({ ...editing, price_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plano</Label>
                  <Select value={editing.plan_name || ""} onValueChange={(v) => setEditing({ ...editing, plan_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {planNames.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo Pagamento</Label>
                  <Select value={(editing.payment_type as string) || ""} onValueChange={(v) => setEditing({ ...editing, payment_type: v as PaymentType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map((pt) => (<SelectItem key={pt} value={pt}>{PAYMENT_TYPE_LABEL[pt]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vendedor</Label>
                  <Select value={editing.seller_user_id || ""} onValueChange={(v) => setEditing({ ...editing, seller_user_id: v || null })}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Nenhum —</SelectItem>
                      {profiles.map((p) => (<SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rótulo Vendedor</Label>
                  <Input value={editing.seller_label || ""} onChange={(e) => setEditing({ ...editing, seller_label: e.target.value })} />
                </div>
                <div>
                  <Label>Área</Label>
                  <Input value={editing.area || ""} onChange={(e) => setEditing({ ...editing, area: e.target.value })} />
                </div>
                <div>
                  <Label>MRR Override</Label>
                  <Input type="number" step="0.01" value={editing.mrr_override ?? ""} onChange={(e) => setEditing({ ...editing, mrr_override: e.target.value === "" ? null : Number(e.target.value) })} />
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
