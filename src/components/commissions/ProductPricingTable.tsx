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

const PERIODICITIES = ["Avulso", "Mensal", "Trimestral", "Semestral", "Anual", "Vitalício"];

interface Product {
  id: string;
  product_id: string | null;
  name: string;
  plan_name: string;
  periodicity: string;
  plan_value: number;
  plan_mrr: number;
  commission_percent: number;
}

export function ProductPricingTable() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [form, setForm] = useState({
    product_id: "", name: "", plan_name: "", periodicity: "Mensal",
    plan_value: "", plan_mrr: "", commission_percent: "10",
  });

  const fetchProducts = async () => {
    const { data } = await supabase.from("commission_products").select("*").order("name");
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ product_id: "", name: "", plan_name: "", periodicity: "Mensal", plan_value: "", plan_mrr: "", commission_percent: "10" });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      product_id: p.product_id || "",
      name: p.name,
      plan_name: p.plan_name,
      periodicity: p.periodicity,
      plan_value: p.plan_value.toString(),
      plan_mrr: p.plan_mrr.toString(),
      commission_percent: p.commission_percent.toString(),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      product_id: form.product_id || null,
      name: form.name,
      plan_name: form.plan_name,
      periodicity: form.periodicity,
      plan_value: Number(form.plan_value) || 0,
      plan_mrr: Number(form.plan_mrr) || 0,
      commission_percent: Number(form.commission_percent) || 0,
    };

    const { error } = editing
      ? await supabase.from("commission_products").update(payload).eq("id", editing.id)
      : await supabase.from("commission_products").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Produto atualizado" : "Produto criado" });
      setDialogOpen(false);
      fetchProducts();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("commission_products").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Produto excluído" });
      fetchProducts();
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Produtos e Comissões</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Product ID</Label>
                <Input type="number" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} placeholder="Ex: 123" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Produto</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: YampaFin" />
                </div>
                <div>
                  <Label>Plano</Label>
                  <Input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} placeholder="Ex: +Controle" />
                </div>
              </div>
              <div>
                <Label>Periodicidade</Label>
                <Select value={form.periodicity} onValueChange={(v) => setForm({ ...form, periodicity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODICITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valor do Plano (R$)</Label>
                  <Input type="number" value={form.plan_value} onChange={(e) => setForm({ ...form, plan_value: e.target.value })} />
                </div>
                <div>
                  <Label>MRR (R$)</Label>
                  <Input type="number" value={form.plan_mrr} onChange={(e) => setForm({ ...form, plan_mrr: e.target.value })} />
                </div>
                <div>
                  <Label>Comissão (%)</Label>
                  <Input type="number" step="0.1" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} />
                </div>
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
                <TableHead>Product ID</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Periodicidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Comissão (%)</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.product_id || "—"}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.plan_name || "—"}</TableCell>
                  <TableCell>{p.periodicity}</TableCell>
                  <TableCell className="text-right">{fmt(p.plan_value)}</TableCell>
                  <TableCell className="text-right">{fmt(p.plan_mrr)}</TableCell>
                  <TableCell className="text-right">{p.commission_percent}%</TableCell>
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
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
