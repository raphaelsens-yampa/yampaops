import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  addMonths,
  toDateOnly,
  type CommissionReference,
  type PaymentType,
} from "@/lib/commissioning";
import type { ProfileLite } from "@/pages/Comissionamento";

interface Props {
  reference: CommissionReference[];
  profiles: ProfileLite[];
  onClose: () => void;
  onSaved: () => void;
}

export function ManualConversionDialog({ reference, profiles, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [saleMonth, setSaleMonth] = useState(defaultMonth);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [planName, setPlanName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("mensal");
  const [mrr, setMrr] = useState<string>("");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [sellerLabel, setSellerLabel] = useState("");
  const [offerName, setOfferName] = useState("");
  const [saving, setSaving] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const allPlanNames = useMemo(
    () => Array.from(new Set(reference.map((r) => r.plan_name))).sort(),
    [reference],
  );

  const paymentMonth = useMemo(() => {
    const [y, m] = saleMonth.split("-").map(Number);
    return addMonths(new Date(y, m - 1, 1), 2);
  }, [saleMonth]);

  const ref = useMemo(
    () =>
      reference.find(
        (r) => r.plan_name === planName && r.payment_type === paymentType && r.is_active,
      ),
    [reference, planName, paymentType],
  );

  const pct = ref ? (paymentType === "anual_avista" ? (ref.av_pct ?? 0) : ref.commission_pct) : 0;
  const mrrNum = Number(mrr.replace(",", ".")) || 0;
  const commissionAmount = mrrNum * pct;

  const handleSave = async () => {
    if (!planName) {
      toast({ title: "Selecione um plano", variant: "destructive" });
      return;
    }
    if (!mrrNum || mrrNum <= 0) {
      toast({ title: "Informe o MRR", variant: "destructive" });
      return;
    }
    if (!sellerUserId && !sellerLabel) {
      toast({ title: "Informe o vendedor (usuário ou rótulo)", variant: "destructive" });
      return;
    }

    setSaving(true);
    const [y, m] = saleMonth.split("-").map(Number);
    const sale = new Date(y, m - 1, 1);

    const { error } = await supabase.from("commission_conversions").insert({
      import_id: null,
      sale_month: toDateOnly(sale),
      payment_month: toDateOnly(paymentMonth),
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      price_id: null,
      offer_name: offerName || null,
      mrr: mrrNum,
      origem_cliente: "manual",
      resolved_plan: planName,
      resolved_payment_type: paymentType,
      resolved_seller_user_id: sellerUserId || null,
      resolved_seller_label: sellerLabel || null,
      commission_pct: pct,
      commission_amount: commissionAmount,
      status: ref ? "calculated" : "pending_mapping",
    });

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conversão manual adicionada" });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar conversão manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês da venda (M0)</Label>
              <Input type="month" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} />
            </div>
            <div>
              <Label>Mês do pagamento</Label>
              <Input
                value={paymentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                disabled
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="opcional" />
            </div>
          </div>
          <div>
            <Label>Oferta (opcional)</Label>
            <Input value={offerName} onChange={(e) => setOfferName(e.target.value)} placeholder="Ex.: +Lucro" />
          </div>
          <div>
            <Label>Plano</Label>
            <Popover open={planOpen} onOpenChange={setPlanOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className={cn("truncate", !planName && "text-muted-foreground")}>
                    {planName || "Selecione..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar plano..." />
                  <CommandList>
                    <CommandEmpty>Nenhum plano encontrado</CommandEmpty>
                    <CommandGroup>
                      {allPlanNames.map((p) => (
                        <CommandItem key={p} value={p} onSelect={() => { setPlanName(p); setPlanOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", planName === p ? "opacity-100" : "opacity-0")} />
                          {p}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label>MRR (R$)</Label>
              <Input value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder="Ex.: 209,01" inputMode="decimal" />
            </div>
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
              <Input value={sellerLabel} onChange={(e) => setSellerLabel(e.target.value)} placeholder="Ex.: Duda" />
            </div>
          </div>

          <div className="rounded-md bg-muted p-3 text-xs space-y-1">
            <div>
              <strong>Comissão calculada:</strong>{" "}
              {ref
                ? `${(pct * 100).toFixed(1)}% × R$ ${mrrNum.toFixed(2)} = R$ ${commissionAmount.toFixed(2)}`
                : "Sem regra ativa em Referência — será marcada como pendente."}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar conversão"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
