import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface StripePrice {
  id: string;
  product_name: string;
  plan_name: string;
  price_id: string;
  area: string | null;
  seller_id: string | null;
  mrr: number;
}

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export function StripePricesTable() {
  const { toast } = useToast();
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<StripePrice | null>(null);

  const [form, setForm] = useState({
    product_name: "", plan_name: "", price_id: "", area: "", seller_id: "", mrr: "",
  });

  const fetchData = async () => {
    const [{ data: priceData }, { data: profData }] = await Promise.all([
      supabase.from("stripe_prices").select("*").order("product_name"),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    setPrices((priceData as StripePrice[]) || []);
    setProfiles(profData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ product_name: "", plan_name: "", price_id: "", area: "", seller_id: "", mrr: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: StripePrice) => {
    setEditing(p);
    setForm({
      product_name: p.product_name,
      plan_name: p.plan_name,
      price_id: p.price_id,
      area: p.area || "",
      seller_id: p.seller_id || "",
      mrr: p.mrr.toString(),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_name || !form.price_id) return;
    setSaving(true);
    const payload = {
      product_name: form.product_name,
      plan_name: form.plan_name,
      price_id: form.price_id,
      area: form.area || null,
      seller_id: form.seller_id || null,
      mrr: Number(form.mrr) || 0,
    };

    const { error } = editing
      ? await supabase.from("stripe_prices").update(payload).eq("id", editing.id)
      : await supabase.from("stripe_prices").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Price ID atualizado" : "Price ID criado" });
      setDialogOpen(false);
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este Price ID?")) return;
    const { error } = await supabase.from("stripe_prices").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Price ID excluído" });
      fetchData();
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const getSellerName = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find((p) => p.user_id === id);
    return p?.full_name || p?.email || id;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Stripe Price IDs</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Price ID</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Price ID" : "Novo Price ID"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Produto</Label>
                  <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="Ex: +Sucesso" />
                </div>
                <div>
                  <Label>Plano</Label>
                  <Input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} placeholder="Ex: Mensal" />
                </div>
              </div>
              <div>
                <Label>Price ID (Stripe)</Label>
                <Input value={form.price_id} onChange={(e) => setForm({ ...form, price_id: e.target.value })} placeholder="price_..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Área</Label>
                  <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex: Comercial" />
                </div>
                <div>
                  <Label>MRR (R$)</Label>
                  <Input type="number" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Vendedor</Label>
                <Select value={form.seller_id} onValueChange={(v) => setForm({ ...form, seller_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar vendedor (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Price ID</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.product_name}</TableCell>
                  <TableCell>{p.plan_name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.price_id}</TableCell>
                  <TableCell>{p.area || "—"}</TableCell>
                  <TableCell>{getSellerName(p.seller_id)}</TableCell>
                  <TableCell className="text-right">{fmt(p.mrr)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {prices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum Price ID cadastrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
