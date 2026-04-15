import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  subscription_commission: number;
  setup_commission: number;
  annual_multiplier: number;
  monthly_multiplier: number;
}

export function ProductPricingTable() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [form, setForm] = useState({
    name: "",
    subscription_commission: "",
    setup_commission: "",
    annual_multiplier: "1",
    monthly_multiplier: "1",
  });

  const fetchProducts = async () => {
    const { data } = await supabase.from("commission_products").select("*").order("name");
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", subscription_commission: "", setup_commission: "", annual_multiplier: "1", monthly_multiplier: "1" });
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      subscription_commission: p.subscription_commission.toString(),
      setup_commission: p.setup_commission.toString(),
      annual_multiplier: p.annual_multiplier.toString(),
      monthly_multiplier: p.monthly_multiplier.toString(),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      name: form.name,
      subscription_commission: Number(form.subscription_commission) || 0,
      setup_commission: Number(form.setup_commission) || 0,
      annual_multiplier: Number(form.annual_multiplier) || 1,
      monthly_multiplier: Number(form.monthly_multiplier) || 1,
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
        <CardTitle className="text-sm font-medium">Tabela de Produtos e Comissões</CardTitle>
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
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Comissão Assinatura (R$)</Label>
                  <Input type="number" value={form.subscription_commission} onChange={(e) => setForm({ ...form, subscription_commission: e.target.value })} />
                </div>
                <div>
                  <Label>Comissão Setup (R$)</Label>
                  <Input type="number" value={form.setup_commission} onChange={(e) => setForm({ ...form, setup_commission: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Multiplicador Anual</Label>
                  <Input type="number" step="0.1" value={form.annual_multiplier} onChange={(e) => setForm({ ...form, annual_multiplier: e.target.value })} />
                </div>
                <div>
                  <Label>Multiplicador Mensal</Label>
                  <Input type="number" step="0.1" value={form.monthly_multiplier} onChange={(e) => setForm({ ...form, monthly_multiplier: e.target.value })} />
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
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Assinatura</TableHead>
                <TableHead className="text-right">Setup</TableHead>
                <TableHead className="text-right">Mult. Anual</TableHead>
                <TableHead className="text-right">Mult. Mensal</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{fmt(p.subscription_commission)}</TableCell>
                  <TableCell className="text-right">{fmt(p.setup_commission)}</TableCell>
                  <TableCell className="text-right">{p.annual_multiplier}x</TableCell>
                  <TableCell className="text-right">{p.monthly_multiplier}x</TableCell>
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
