import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  type CommissionReference,
  type PaymentType,
  type PriceMapEntry,
} from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";

interface Props {
  target: ConversionRow;
  reference: CommissionReference[];
  priceMap: PriceMapEntry[];
  profiles: ProfileLite[];
  onClose: () => void;
  onMapped: () => void;
}

export function MapPriceDialog({ target, reference, priceMap, profiles, onClose, onMapped }: Props) {
  const { toast } = useToast();
  const AREAS = ["Sales", "CX", "Marketing", "Produto", "Parceria"] as const;
  const [planName, setPlanName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("mensal");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [sellerLabel, setSellerLabel] = useState("");
  const [area, setArea] = useState<string>("Sales");
  const [mrrOverride, setMrrOverride] = useState<string>(
    target.mrr != null ? String(target.mrr) : "",
  );
  const [saving, setSaving] = useState(false);
  const [planPopoverOpen, setPlanPopoverOpen] = useState(false);
  const [planQuery, setPlanQuery] = useState("");

  const allPlanNames = useMemo(() => {
    const fromRef = reference.map((r) => r.plan_name);
    const fromMap = priceMap.map((m) => m.plan_name).filter(Boolean) as string[];
    return Array.from(new Set([...fromRef, ...fromMap])).sort();
  }, [reference, priceMap]);

  const planNamesFromRef = useMemo(
    () => new Set(reference.map((r) => r.plan_name)),
    [reference],
  );

  const trimmedQuery = planQuery.trim();
  const exactMatch = allPlanNames.some((p) => p.toLowerCase() === trimmedQuery.toLowerCase());

  const selectPlan = (name: string) => {
    setPlanName(name);
    setPlanPopoverOpen(false);
    setPlanQuery("");
  };

  const handleSave = async () => {
    if (!planName) {
      toast({ title: "Selecione ou crie um plano", variant: "destructive" });
      return;
    }
    setSaving(true);
    const normalizedPriceId = target.price_id?.trim() || null;
    const normalizedOfferName = target.offer_name?.trim() || null;
    const payload = {
      price_id: normalizedPriceId,
      offer_name: normalizedPriceId ? null : normalizedOfferName,
      price_name: normalizedOfferName,
      plan_name: planName,
      payment_type: paymentType,
      area: area,
      seller_user_id: sellerUserId || null,
      seller_label: sellerLabel || null,
      mrr_override: mrrOverride.trim() === "" ? null : Number(mrrOverride),
    };
    try {
      let existingId: string | null = null;

      if (payload.price_id) {
        const { data: byPriceId, error: priceLookupError } = await supabase
          .from("commission_price_map")
          .select("id")
          .eq("price_id", payload.price_id)
          .maybeSingle();

        if (priceLookupError) throw priceLookupError;
        existingId = byPriceId?.id ?? null;

        if (!existingId && normalizedOfferName) {
          const { data: byOfferName, error: offerLookupError } = await supabase
            .from("commission_price_map")
            .select("id, price_id")
            .eq("offer_name", normalizedOfferName)
            .maybeSingle();

          if (offerLookupError) throw offerLookupError;
          if (byOfferName && (!byOfferName.price_id || byOfferName.price_id === payload.price_id)) {
            existingId = byOfferName.id;
          }
        }
      } else if (payload.offer_name) {
        const { data: byOfferName, error: offerLookupError } = await supabase
          .from("commission_price_map")
          .select("id")
          .eq("offer_name", payload.offer_name)
          .maybeSingle();

        if (offerLookupError) throw offerLookupError;
        existingId = byOfferName?.id ?? null;
      }

      const { error } = existingId
        ? await supabase.from("commission_price_map").update(payload).eq("id", existingId)
        : await supabase.from("commission_price_map").insert(payload);

      if (error) throw error;

      // Recalcular conversões já importadas que casam com esse mapeamento
      const ref = reference.find(
        (r) => r.plan_name === planName && r.payment_type === paymentType && r.is_active,
      );

      let query = supabase
        .from("commission_conversions")
        .select("id, mrr, price_id, offer_name");

      if (normalizedPriceId) {
        query = query.eq("price_id", normalizedPriceId);
      } else if (normalizedOfferName) {
        query = query.is("price_id", null).eq("offer_name", normalizedOfferName);
      } else {
        query = query.eq("id", "__none__");
      }

      const { data: matchingConversions, error: convErr } = await query;
      if (convErr) throw convErr;

      let recalculated = 0;
      if (matchingConversions && matchingConversions.length > 0) {
        const pct = ref
          ? (paymentType === "anual_avista" ? (ref.av_pct ?? 0) : ref.commission_pct)
          : 0;
        for (const c of matchingConversions) {
          const { error: upErr } = await supabase
            .from("commission_conversions")
            .update({
              resolved_plan: planName,
              resolved_payment_type: paymentType,
              resolved_seller_user_id: sellerUserId || null,
              resolved_seller_label: sellerLabel || null,
              commission_pct: pct,
              commission_amount: Number(c.mrr || 0) * pct,
              status: ref ? "calculated" : "pending_mapping",
            })
            .eq("id", c.id);
          if (upErr) throw upErr;
          recalculated++;
        }
      }

      // Também atualizar stripe_conversions já existentes para refletir o novo mapeamento
      let stripeUpdated = 0;
      if (normalizedPriceId) {
        const { data: stripeRows, error: stripeErr } = await supabase
          .from("stripe_conversions")
          .select("id, mrr")
          .eq("stripe_price_id", normalizedPriceId);
        if (stripeErr) throw stripeErr;
        if (stripeRows && stripeRows.length > 0) {
          const overrideMrr = null; // mrr_override do price_map é tratado no webhook; aqui mantemos o mrr atual
          for (const s of stripeRows) {
            const { error: sUpErr } = await supabase
              .from("stripe_conversions")
              .update({
                area: payload.area,
                plan_name: planName,
                product_name: normalizedOfferName || undefined,
              })
              .eq("id", s.id);
            if (sUpErr) throw sUpErr;
            stripeUpdated++;
          }
        }
      }

      // Marcar pendências de "preço fora do Mapa" como resolvidas
      if (normalizedPriceId) {
        await supabase
          .from("integration_sync_errors")
          .update({ resolved: true })
          .eq("entity_type", "stripe_unmapped_price")
          .eq("ac_id", normalizedPriceId)
          .eq("resolved", false);
      }

      toast({
        title: "Mapeamento salvo",
        description: `${recalculated} conversão(ões) de comissão e ${stripeUpdated} conversão(ões) Stripe atualizadas.${ref ? "" : " (Plano sem regra ativa na Referência.)"}`,
      });


      onMapped();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o mapeamento.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mapear Price ID / Oferta</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted p-3">
            <div><strong>Cliente:</strong> {target.customer_name}</div>
            <div><strong>Price ID:</strong> {target.price_id || "—"}</div>
            <div><strong>Oferta:</strong> {target.offer_name || "—"}</div>
            <div><strong>MRR:</strong> R$ {Number(target.mrr).toFixed(2)}</div>
          </div>
          <div>
            <Label>Plano</Label>
            <Popover open={planPopoverOpen} onOpenChange={setPlanPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className={cn("truncate", !planName && "text-muted-foreground")}>
                    {planName || "Selecione ou crie..."}
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
                          <Check className={cn("mr-2 h-4 w-4", planName === p ? "opacity-100" : "opacity-0")} />
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
            {planName && !planNamesFromRef.has(planName) && (
              <p className="text-xs text-muted-foreground mt-1">
                Esse plano ainda não tem regra de comissão na aba "Referência". Cadastre lá para calcular automaticamente.
              </p>
            )}
          </div>
          <div>
            <Label>Tipo de Pagamento</Label>
            <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>{PAYMENT_TYPE_LABEL[pt]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Área</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vendedor (usuário)</Label>
              <Select value={sellerUserId || "__none__"} onValueChange={(v) => setSellerUserId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rótulo do Vendedor</Label>
              <Input value={sellerLabel} onChange={(e) => setSellerLabel(e.target.value)} placeholder="Ex.: Duda, Bia..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar mapeamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
