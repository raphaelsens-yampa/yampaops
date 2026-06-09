import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PAYMENT_TYPES, PAYMENT_TYPE_LABEL, type CommissionReference, type PaymentType } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";

interface Props {
  target: ConversionRow;
  reference: CommissionReference[];
  profiles: ProfileLite[];
  onClose: () => void;
  onMapped: () => void;
}

export function MapPriceDialog({ target, reference, profiles, onClose, onMapped }: Props) {
  const { toast } = useToast();
  const [planName, setPlanName] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("mensal");
  const [sellerUserId, setSellerUserId] = useState<string>("");
  const [sellerLabel, setSellerLabel] = useState("Sales");
  const [saving, setSaving] = useState(false);

  const planNames = Array.from(new Set(reference.map((r) => r.plan_name))).sort();

  const handleSave = async () => {
    if (!planName) {
      toast({ title: "Selecione um plano", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      price_id: target.price_id || null,
      offer_name: target.price_id ? null : target.offer_name,
      price_name: target.offer_name,
      plan_name: planName,
      payment_type: paymentType,
      area: "Sales",
      seller_user_id: sellerUserId || null,
      seller_label: sellerLabel || null,
    };
    const { error } = await supabase.from("commission_price_map").upsert(payload, {
      onConflict: target.price_id ? "price_id" : undefined,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mapeamento criado", description: "Reimporte ou recalcule para aplicar." });
    onMapped();
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
            <Select value={planName} onValueChange={setPlanName}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {planNames.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
              </SelectContent>
            </Select>
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
              <Select value={sellerUserId} onValueChange={setSellerUserId}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Nenhum —</SelectItem>
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
