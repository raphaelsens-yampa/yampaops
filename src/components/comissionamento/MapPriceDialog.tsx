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
  const [planName, setPlanName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("mensal");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [sellerLabel, setSellerLabel] = useState("Sales");
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
      area: "Sales",
      seller_user_id: sellerUserId || null,
      seller_label: sellerLabel || null,
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

      toast({ title: "Mapeamento criado", description: "Reimporte ou recalcule para aplicar." });
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
