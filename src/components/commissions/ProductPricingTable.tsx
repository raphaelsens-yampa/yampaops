import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";

const PERIODICITIES = ["Avulso", "Mensal", "Trimestral", "Semestral", "Anual À Vista", "Anual Parcelado", "Vitalício"];

type CommissionBase = "value" | "mrr";

interface Product {
  id: string;
  product_id: string | null;
  name: string;
  plan_name: string;
  periodicity: string;
  plan_value: number;
  plan_mrr: number;
  commission_percent: number;
  commission_base: CommissionBase;
  stripe_price_id: string | null;
  price_name: string | null;
  area: string | null;
  seller_id: string | null;
}

interface Profile { user_id: string; full_name: string | null; email: string | null; }

const SELLER_NONE = "__none__";

export function ProductPricingTable() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    product_id: "", name: "", plan_name: "", periodicity: "Mensal",
    plan_value: "", plan_mrr: "", commission_percent: "10",
    commission_base: "mrr" as CommissionBase,
    stripe_price_id: "", price_name: "", area: "", seller_id: SELLER_NONE,
  });

  const fetchData = async () => {
    const [{ data: prodData }, { data: profData }] = await Promise.all([
      supabase.from("commission_products").select("*").order("name"),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    setProducts((prodData as Product[]) || []);
    setProfiles(profData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) =>
      (p.product_id || "").toLowerCase().includes(q) ||
      (p.stripe_price_id || "").toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.plan_name || "").toLowerCase().includes(q) ||
      (p.price_name || "").toLowerCase().includes(q) ||
      (p.area || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const openNew = () => {
    setEditing(null);
    setForm({
      product_id: "", name: "", plan_name: "", periodicity: "Mensal",
      plan_value: "", plan_mrr: "", commission_percent: "10",
      commission_base: "mrr",
      stripe_price_id: "", price_name: "", area: "", seller_id: SELLER_NONE,
    });
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
      commission_base: (p.commission_base as CommissionBase) || "mrr",
      stripe_price_id: p.stripe_price_id || "",
      price_name: p.price_name || "",
      area: p.area || "",
      seller_id: p.seller_id || SELLER_NONE,
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
      commission_base: form.commission_base,
      stripe_price_id: form.stripe_price_id.trim() || null,
      price_name: form.price_name.trim() || null,
      area: form.area.trim() || null,
      seller_id: form.seller_id === SELLER_NONE ? null : form.seller_id,
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
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("commission_products").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Produto excluído" });
      fetchData();
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const sellerName = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.user_id === id);
    return p?.full_name || p?.email || "—";
  };

  // Preview do valor de comissão no formulário
  const commissionPreview = useMemo(() => {
    const pct = Number(form.commission_percent) || 0;
    const base = form.commission_base === "value"
      ? (Number(form.plan_value) || 0)
      : (Number(form.plan_mrr) || 0);
    return (base * pct) / 100;
  }, [form.commission_percent, form.commission_base, form.plan_value, form.plan_mrr]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-medium">Catálogo de Produtos & Comissões</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Cada linha representa uma oferta vendável. Inclua o Stripe Price ID quando aplicável para auto-vinculação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-9 w-56"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Identificação */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Identificação</h4>
                  <div className="space-y-3">
                    <div>
                      <Label>Product ID (interno)</Label>
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
                  </div>
                </div>

                {/* Valores e comissão */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Valores & Comissão</h4>
                  <div className="space-y-3">
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
                    <div>
                      <Label>Base de Cálculo da Comissão</Label>
                      <Select
                        value={form.commission_base}
                        onValueChange={(v: CommissionBase) => setForm({ ...form, commission_base: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mrr">Sobre o MRR</SelectItem>
                          <SelectItem value="value">Sobre o Valor do Plano</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        A comissão é sempre paga sobre a primeira ocorrência. Escolha se o % incide sobre o MRR ou sobre o Valor do Plano.
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                      Comissão calculada: <strong className="text-foreground">{fmt(commissionPreview)}</strong>
                    </div>
                  </div>
                </div>

                {/* Integração Stripe (opcional) */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Integração Stripe (opcional)</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Stripe Price ID</Label>
                        <Input
                          value={form.stripe_price_id}
                          onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })}
                          placeholder="price_..."
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label>Price Name</Label>
                        <Input value={form.price_name} onChange={(e) => setForm({ ...form, price_name: e.target.value })} placeholder="Ex: Plano Pro Mensal" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Área</Label>
                        <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex: Comercial" />
                      </div>
                      <div>
                        <Label>Vendedor</Label>
                        <Select value={form.seller_id} onValueChange={(v) => setForm({ ...form, seller_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELLER_NONE}>—</SelectItem>
                            {profiles.map((p) => (
                              <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editing ? "Salvar" : "Criar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="relative max-h-[600px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Periodicidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead className="text-right">% Com.</TableHead>
                  <TableHead className="text-right">$ Com.</TableHead>
                  <TableHead>Stripe Price ID</TableHead>
                  <TableHead>Price Name</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => {
                  const baseAmount = p.commission_base === "value" ? p.plan_value : p.plan_mrr;
                  const commissionAmount = (baseAmount * p.commission_percent) / 100;
                  return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.product_id || "—"}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.plan_name || "—"}</TableCell>
                    <TableCell>{p.periodicity}</TableCell>
                    <TableCell className="text-right">{fmt(p.plan_value)}</TableCell>
                    <TableCell className="text-right">{fmt(p.plan_mrr)}</TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">
                        {p.commission_base === "value" ? "Valor" : "MRR"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{p.commission_percent}%</TableCell>
                    <TableCell className="text-right font-medium">{fmt(commissionAmount)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.stripe_price_id || "—"}</TableCell>
                    <TableCell>{p.price_name || "—"}</TableCell>
                    <TableCell>{p.area || "—"}</TableCell>
                    <TableCell>{sellerName(p.seller_id)}</TableCell>
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
                  );
                })}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground py-6">
                      {search ? "Nenhum produto encontrado." : "Nenhum produto cadastrado."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
