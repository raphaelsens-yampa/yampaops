import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ORIGIN_LABELS } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS, type GoalCategory } from "@/lib/goalCategories";
import { TagPicker } from "@/components/tags/TagPicker";
import { useOpportunityTags } from "@/hooks/useTags";
import { format } from "date-fns";

function OpportunityTagSection({ opportunityId }: { opportunityId: string }) {
  const { data: tagMap = {} } = useOpportunityTags([opportunityId]);
  const selectedIds = tagMap[opportunityId] || [];
  return <TagPicker opportunityId={opportunityId} selectedTagIds={selectedIds} />;
}

interface StripePrice {
  id: string;
  price_id: string;
  price_name: string;
  product_name: string;
  plan_name: string;
  mrr: number;
  commission_product_id: string | null;
}

interface CommissionProduct {
  id: string;
  periodicity: string;
}

interface EditOpportunityDialogProps {
  opportunity: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageOrder: string[];
  stageLabels: Record<string, string>;
  profiles: any[];
  onUpdated: () => void;
}

export function EditOpportunityDialog({
  opportunity, open, onOpenChange, stageOrder, stageLabels, profiles, onUpdated,
}: EditOpportunityDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [origin, setOrigin] = useState("freetrial");
  const [subOrigin, setSubOrigin] = useState("");
  const [stage, setStage] = useState("");
  const [mrr, setMrr] = useState("");
  const [tpv, setTpv] = useState("");
  const [probability, setProbability] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [notes, setNotes] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [productId, setProductId] = useState("");
  const [billingType, setBillingType] = useState("monthly");
  const [isActive, setIsActive] = useState(true);
  const [cancellationDate, setCancellationDate] = useState("");
  const [opportunityCreatedAt, setOpportunityCreatedAt] = useState("");
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<GoalCategory[]>([]);

  // Price ID state
  const [stripePrices, setStripePrices] = useState<StripePrice[]>([]);
  const [commissionProducts, setCommissionProducts] = useState<CommissionProduct[]>([]);
  const [selectedStripePriceId, setSelectedStripePriceId] = useState("");
  const [pricePopoverOpen, setPricePopoverOpen] = useState(false);
  const [priceSearch, setPriceSearch] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("commission_products").select("id, name").order("name"),
      supabase
        .from("commission_products")
        .select("id, stripe_price_id, price_name, name, plan_name, plan_mrr")
        .not("stripe_price_id", "is", null)
        .order("price_name"),
      supabase.from("commission_products").select("id, periodicity"),
      supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name"),
    ]).then(([{ data: prodData }, { data: spData }, { data: cpData }, { data: catData }]) => {
      setProducts(prodData || []);
      // Adapta o formato unificado para a interface StripePrice usada na UI
      const adapted: StripePrice[] = (spData || []).map((row: any) => ({
        id: row.id,
        price_id: row.stripe_price_id,
        price_name: row.price_name || "",
        product_name: row.name || "",
        plan_name: row.plan_name || "",
        mrr: row.plan_mrr || 0,
        commission_product_id: row.id, // mesma linha agora é o produto
      }));
      setStripePrices(adapted);
      setCommissionProducts((cpData as CommissionProduct[]) || []);
      setCategories((catData as GoalCategory[]) || []);
    });
  }, []);

  useEffect(() => {
    if (opportunity) {
      setTitle(opportunity.title || "");
      setName(opportunity.name || "");
      setCompany(opportunity.company || "");
      setOrigin(opportunity.origin || "freetrial");
      setSubOrigin(opportunity.sub_origin || "");
      setStage(opportunity.stage || "");
      setMrr(opportunity.estimated_mrr?.toString() || "");
      setTpv(opportunity.estimated_tpv?.toString() || "");
      setProbability(opportunity.probability?.toString() || "");
      setCloseDate(opportunity.estimated_close_date || "");
      setConsultantId(opportunity.consultant_id || "");
      setNotes(opportunity.notes || "");
      setLossReason(opportunity.loss_reason || "");
      setProductId(opportunity.product_id || "");
      setBillingType(opportunity.billing_type || "monthly");
      setIsActive(opportunity.is_active !== false);
      setCancellationDate(opportunity.cancellation_date || "");
      // opportunity_created_at: format as YYYY-MM-DD for date input
      const oppCreated = opportunity.opportunity_created_at || opportunity.created_at;
      setOpportunityCreatedAt(oppCreated ? new Date(oppCreated).toISOString().slice(0, 10) : "");
      setCategoryId(opportunity.category_id || "");
      // We don't store stripe_price_id on opportunity yet, so reset
      setSelectedStripePriceId("");
    }
  }, [opportunity]);

  const selectedStripePrice = useMemo(
    () => stripePrices.find((sp) => sp.id === selectedStripePriceId),
    [stripePrices, selectedStripePriceId]
  );

  const filteredPrices = useMemo(() => {
    if (!priceSearch) return stripePrices;
    const q = priceSearch.toLowerCase();
    return stripePrices.filter(
      (sp) =>
        sp.price_id.toLowerCase().includes(q) ||
        sp.price_name.toLowerCase().includes(q)
    );
  }, [stripePrices, priceSearch]);

  const periodicityToBillingType = (periodicity: string) => {
    const map: Record<string, string> = {
      "Mensal": "monthly",
      "Anual": "annual",
      "Trimestral": "quarterly",
      "Semestral": "semiannual",
      "Avulso": "one_time",
      "Vitalício": "lifetime",
    };
    return map[periodicity] || "monthly";
  };

  const handleSelectStripePrice = (spId: string) => {
    setSelectedStripePriceId(spId);
    setPricePopoverOpen(false);
    const sp = stripePrices.find((p) => p.id === spId);
    if (sp) {
      // Auto-fill MRR
      setMrr(sp.mrr.toString());
      // Auto-fill product
      if (sp.commission_product_id) {
        setProductId(sp.commission_product_id);
        // Auto-fill billing type from product periodicity
        const cp = commissionProducts.find((c) => c.id === sp.commission_product_id);
        if (cp) {
          setBillingType(periodicityToBillingType(cp.periodicity));
        }
      }
    }
  };

  const isWonStage = stageOrder.length > 0 && stage === "fechado_won";

  const handleSave = async () => {
    if (!opportunity) return;
    // Validate Price ID required for Won
    if (isWonStage && !selectedStripePriceId) {
      toast({ title: "Price ID obrigatório", description: "Selecione um Price ID para marcar como Won.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("opportunities").update({
      title: title || null,
      name,
      company: company || null,
      origin: origin as any,
      sub_origin: subOrigin || null,
      stage,
      estimated_mrr: mrr ? Number(mrr) : null,
      estimated_tpv: tpv ? Number(tpv) : null,
      probability: probability ? Number(probability) : null,
      estimated_close_date: closeDate || null,
      consultant_id: consultantId || null,
      notes: notes || null,
      loss_reason: lossReason || null,
      product_id: productId || null,
      billing_type: billingType,
      is_active: isActive,
      cancellation_date: cancellationDate || null,
      category_id: categoryId || null,
      opportunity_created_at: opportunityCreatedAt ? new Date(opportunityCreatedAt + "T00:00:00").toISOString() : null,
    }).eq("id", opportunity.id);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Oportunidade atualizada" });
      onUpdated();
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    if (!opportunity || !confirm("Tem certeza que deseja excluir esta oportunidade?")) return;
    setDeleting(true);
    const { error } = await supabase.from("opportunities").delete().eq("id", opportunity.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Oportunidade excluída" });
      onUpdated();
      onOpenChange(false);
    }
  };

  if (!opportunity) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da oportunidade" />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Etapa</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stageOrder.map(s => (
                    <SelectItem key={s} value={s}>{stageLabels[s] || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal de Origem</Label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIGIN_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price ID / Price Name selector */}
          <div className="rounded-lg border p-3 space-y-2">
            <Label className="font-semibold">
              Price ID / Price Name
              {isWonStage && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Popover open={pricePopoverOpen} onOpenChange={setPricePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedStripePrice
                    ? `${selectedStripePrice.price_id} — ${selectedStripePrice.price_name || selectedStripePrice.product_name}`
                    : "Buscar por Price ID ou Price Name..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Pesquisar Price ID ou Price Name..."
                    value={priceSearch}
                    onValueChange={setPriceSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhum Price ID encontrado.</CommandEmpty>
                    <CommandGroup>
                      {filteredPrices.map((sp) => (
                        <CommandItem
                          key={sp.id}
                          value={sp.id}
                          onSelect={() => handleSelectStripePrice(sp.id)}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedStripePriceId === sp.id ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">{sp.price_id}</span>
                            <span className="text-xs text-muted-foreground">{sp.price_name || sp.product_name} — {sp.plan_name}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {isWonStage && !selectedStripePriceId && (
              <p className="text-xs text-destructive">Obrigatório para oportunidades Won.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Cobrança</Label>
              <Select value={billingType} onValueChange={setBillingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="semiannual">Semestral</SelectItem>
                  <SelectItem value="one_time">Avulso</SelectItem>
                  <SelectItem value="lifetime">Vitalício</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Categoria de Meta</Label>
            <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {(["sales","cs","campaign","financial"] as const).map(area => {
                  const items = categories.filter(c => c.area === area);
                  if (!items.length) return null;
                  return (
                    <div key={area}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{AREA_LABELS[area]}</div>
                      {items.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>MRR (R$)</Label>
              <Input type="number" value={mrr} onChange={e => setMrr(e.target.value)} />
            </div>
            <div>
              <Label>TPV (R$)</Label>
              <Input type="number" value={tpv} onChange={e => setTpv(e.target.value)} />
            </div>
            <div>
              <Label>Probabilidade (%)</Label>
              <Input type="number" value={probability} onChange={e => setProbability(e.target.value)} min="0" max="100" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data prevista de fechamento</Label>
              <Input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
            </div>
            <div>
              <Label>Sub-origem</Label>
              <Input value={subOrigin} onChange={e => setSubOrigin(e.target.value)} placeholder="Ex: campanha X" />
            </div>
          </div>

          {/* Bloco de Datas */}
          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <Label className="font-semibold">Datas</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Criação</Label>
                <Input
                  type="date"
                  value={opportunityCreatedAt}
                  onChange={(e) => setOpportunityCreatedAt(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Conversão</Label>
                <Input
                  type="text"
                  readOnly
                  value={opportunity?.converted_at ? format(new Date(opportunity.converted_at), "dd/MM/yyyy") : "—"}
                  className="bg-muted/50 cursor-not-allowed"
                />
              </div>
              <div>
                <Label className="text-xs">Encerramento</Label>
                <Input
                  type="text"
                  readOnly
                  value={opportunity?.closed_at ? format(new Date(opportunity.closed_at), "dd/MM/yyyy") : "—"}
                  className="bg-muted/50 cursor-not-allowed"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Conversão e Encerramento são preenchidos automaticamente quando a oportunidade entra em uma etapa de ganho ou perda.
            </p>
          </div>

          {/* Bloco de Tags */}
          <div className="rounded-lg border p-3 space-y-2">
            <Label className="font-semibold">Tags</Label>
            <OpportunityTagSection opportunityId={opportunity!.id} />
          </div>

          <div>
            <Label>Consultor</Label>
            <Select value={consultantId} onValueChange={setConsultantId}>
              <SelectTrigger><SelectValue placeholder="Selecionar consultor" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Oportunidade Ativa</Label>
              <p className="text-xs text-muted-foreground">Desmarque para registrar cancelamento</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {!isActive && (
            <div>
              <Label>Data de Cancelamento</Label>
              <Input type="date" value={cancellationDate} onChange={e => setCancellationDate(e.target.value)} />
            </div>
          )}

          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          {stage === "perdido" && (
            <div>
              <Label>Motivo da perda</Label>
              <Textarea value={lossReason} onChange={e => setLossReason(e.target.value)} rows={2} placeholder="Por que essa oportunidade foi perdida?" />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar alterações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
