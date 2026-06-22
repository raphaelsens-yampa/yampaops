import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
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

interface ColFilters {
  priceId: string;
  name: string;
  plan: string;
  type: string;
  seller: string;
  area: string;
}

const EMPTY_FILTERS: ColFilters = { priceId: "", name: "", plan: "", type: "", seller: "", area: "" };

export function ComissionamentoPriceMap({ priceMap, reference, profiles, onChanged }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ColFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Partial<PriceMapEntry> | null>(null);
  const [planPopoverOpen, setPlanPopoverOpen] = useState(false);
  const [planQuery, setPlanQuery] = useState("");

  const planNamesFromRef = useMemo(() => Array.from(new Set(reference.map((r) => r.plan_name))).sort(), [reference]);
  const planNamesFromMap = useMemo(
    () => Array.from(new Set(priceMap.map((m) => m.plan_name).filter(Boolean) as string[])).sort(),
    [priceMap],
  );
  const allPlanNames = useMemo(
    () => Array.from(new Set([...planNamesFromRef, ...planNamesFromMap])).sort(),
    [planNamesFromRef, planNamesFromMap],
  );

  const sellerName = (m: PriceMapEntry) => {
    if (m.seller_user_id) {
      const p = profiles.find((p) => p.user_id === m.seller_user_id);
      if (p) return p.full_name || p.email;
    }
    return m.seller_label || "";
  };

  const filtered = priceMap.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      const hit =
        (m.price_id || "").toLowerCase().includes(q) ||
        (m.offer_name || "").toLowerCase().includes(q) ||
        (m.price_name || "").toLowerCase().includes(q) ||
        (m.plan_name || "").toLowerCase().includes(q) ||
        (m.seller_label || "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filters.priceId) {
      const v = filters.priceId.toLowerCase();
      if (!(m.price_id || "").toLowerCase().includes(v) && !(m.offer_name || "").toLowerCase().includes(v)) return false;
    }
    if (filters.name && !(m.price_name || "").toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.plan && !(m.plan_name || "").toLowerCase().includes(filters.plan.toLowerCase())) return false;
    if (filters.type && m.payment_type !== filters.type) return false;
    if (filters.seller && !sellerName(m).toLowerCase().includes(filters.seller.toLowerCase())) return false;
    if (filters.area && (m.area || "") !== filters.area) return false;
    return true;
  });

  const areaOptions = useMemo(
    () => Array.from(new Set(priceMap.map((m) => m.area).filter(Boolean) as string[])).sort(),
    [priceMap],
  );

  const hasColFilters = Object.values(filters).some(Boolean);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.price_id && !editing.offer_name) {
      toast({ title: "Informe Price ID ou Nome da Oferta", variant: "destructive" });
      return;
    }
    if (editing.requires_commission) {
      if (!editing.plan_name || !editing.payment_type) {
        toast({ title: "Comissionamento exige Plano e Tipo de Pagamento", variant: "destructive" });
        return;
      }
      const refMatch = reference.find(
        (r) => r.plan_name === editing.plan_name && r.payment_type === editing.payment_type && r.is_active,
      );
      if (!refMatch) {
        toast({
          title: "Sem regra na Referência",
          description: `Cadastre "${editing.plan_name}" / ${PAYMENT_TYPE_LABEL[editing.payment_type as PaymentType]} na aba Referência antes de marcar Comissionamento.`,
          variant: "destructive",
        });
        return;
      }
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
      requires_commission: !!editing.requires_commission,
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

  const selectPlan = (name: string) => {
    setEditing((e) => ({ ...(e || {}), plan_name: name }));
    setPlanPopoverOpen(false);
    setPlanQuery("");
  };

  const trimmedQuery = planQuery.trim();
  const exactMatch = allPlanNames.some((p) => p.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-medium">Mapa de Preços</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{priceMap.length} entradas — relaciona Price ID/Oferta com plano e vendedor</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar (global)..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
          {hasColFilters && (
            <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button>
          )}
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
              <TableHead className="text-left">Área</TableHead>
              <TableHead className="text-left">Vendedor</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead className="text-center">Comissão</TableHead>
              <TableHead></TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-left py-1">
                <Input value={filters.priceId} onChange={(e) => setFilters({ ...filters, priceId: e.target.value })} placeholder="Filtrar..." className="h-8 text-xs" />
              </TableHead>
              <TableHead className="text-left py-1">
                <Input value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} placeholder="Filtrar..." className="h-8 text-xs" />
              </TableHead>
              <TableHead className="text-left py-1">
                <Input value={filters.plan} onChange={(e) => setFilters({ ...filters, plan: e.target.value })} placeholder="Filtrar..." className="h-8 text-xs" />
              </TableHead>
              <TableHead className="text-left py-1">
                <Select value={filters.type || "__all__"} onValueChange={(v) => setFilters({ ...filters, type: v === "__all__" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {PAYMENT_TYPES.map((pt) => (<SelectItem key={pt} value={pt}>{PAYMENT_TYPE_LABEL[pt]}</SelectItem>))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="text-left py-1">
                <Input value={filters.seller} onChange={(e) => setFilters({ ...filters, seller: e.target.value })} placeholder="Filtrar..." className="h-8 text-xs" />
              </TableHead>
              <TableHead className="text-left py-1">
                <Select value={filters.area || "__all__"} onValueChange={(v) => setFilters({ ...filters, area: v === "__all__" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {areaOptions.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 300).map((m) => {
              const ref = m.plan_name && m.payment_type
                ? reference.find((r) => r.plan_name === m.plan_name && r.payment_type === m.payment_type && r.is_active)
                : null;
              const effectiveMrr = m.mrr_override ?? ref?.plan_mrr ?? null;
              const isOverride = m.mrr_override != null;
              return (
              <TableRow key={m.id}>
                <TableCell className="text-left">
                  {m.price_id ? <code className="text-xs">{m.price_id}</code> : <Badge variant="outline">Oferta: {m.offer_name}</Badge>}
                </TableCell>
                <TableCell className="text-left text-xs max-w-[260px] truncate">{m.price_name}</TableCell>
                <TableCell className="text-left">{m.plan_name || <span className="text-destructive">—</span>}</TableCell>
                <TableCell className="text-left">{m.payment_type ? PAYMENT_TYPE_LABEL[m.payment_type] : "—"}</TableCell>
                <TableCell className="text-left">{sellerName(m) || "—"}</TableCell>
                <TableCell className="text-left">{m.area || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {effectiveMrr != null ? (
                    <span className={isOverride ? "font-semibold" : "text-muted-foreground"} title={isOverride ? "Override" : "Da tabela de referência"}>
                      {effectiveMrr.toFixed(2)}{isOverride ? "*" : ""}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-center">
                  {m.requires_commission ? (
                    ref ? (
                      <Badge variant="default" className="gap-1"><Check className="h-3 w-3" /> Sim</Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1" title="Sem regra correspondente na Referência">
                        <AlertTriangle className="h-3 w-3" /> Sem ref
                      </Badge>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
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
                  <Popover open={planPopoverOpen} onOpenChange={setPlanPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        <span className={cn("truncate", !editing.plan_name && "text-muted-foreground")}>
                          {editing.plan_name || "Selecione ou crie..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar plano..." value={planQuery} onValueChange={setPlanQuery} />
                        <CommandList>
                          <CommandEmpty>
                            {trimmedQuery ? (
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                onClick={() => selectPlan(trimmedQuery)}
                              >
                                <Plus className="h-4 w-4" /> Criar "{trimmedQuery}"
                              </button>
                            ) : "Nenhum plano encontrado"}
                          </CommandEmpty>
                          <CommandGroup>
                            {allPlanNames.map((p) => (
                              <CommandItem key={p} value={p} onSelect={() => selectPlan(p)}>
                                <Check className={cn("mr-2 h-4 w-4", editing.plan_name === p ? "opacity-100" : "opacity-0")} />
                                {p}
                              </CommandItem>
                            ))}
                            {trimmedQuery && !exactMatch && (
                              <CommandItem value={`__create_${trimmedQuery}`} onSelect={() => selectPlan(trimmedQuery)}>
                                <Plus className="mr-2 h-4 w-4" /> Criar "{trimmedQuery}"
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                  <Select value={editing.seller_user_id || "__none__"} onValueChange={(v) => setEditing({ ...editing, seller_user_id: v === "__none__" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Nenhum —</SelectItem>
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
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!editing.requires_commission}
                    onCheckedChange={(v) => setEditing({ ...editing, requires_commission: v === true })}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Comissionamento</div>
                    <p className="text-xs text-muted-foreground">
                      Marque para que este Price ID gere comissão. Exige Plano + Tipo cadastrados na aba "Referência".
                    </p>
                  </div>
                </label>
                {editing.requires_commission && editing.plan_name && editing.payment_type && !reference.find(
                  (r) => r.plan_name === editing.plan_name && r.payment_type === editing.payment_type && r.is_active,
                ) && (
                  <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Não existe regra ativa para <strong>{editing.plan_name}</strong> / {PAYMENT_TYPE_LABEL[editing.payment_type as PaymentType]} na Referência.
                      Cadastre lá antes de salvar.
                    </span>
                  </div>
                )}
              </div>
              {editing.plan_name && !planNamesFromRef.includes(editing.plan_name) && !editing.requires_commission && (
                <p className="text-xs text-muted-foreground">
                  Esse plano ainda não tem regra de comissão na aba "Referência".
                </p>
              )}
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
