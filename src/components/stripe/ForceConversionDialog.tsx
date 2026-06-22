import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export interface ForcePrefill {
  email: string;
  area?: string | null;
  mrr?: number;
  plan_name?: string | null;
  product_name?: string | null;
  subscription_id?: string | null;
  customer_id?: string | null;
  price_id?: string | null;
  registered_at?: string | null;
  converted_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill: ForcePrefill | null;
  onSaved: () => void;
}

const AREAS = ["Sales", "Marketing", "CX", "Parceria", "Produto", "desconhecida"];

export function ForceConversionDialog({ open, onOpenChange, prefill, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [area, setArea] = useState(prefill?.area || "Sales");
  const [mrr, setMrr] = useState<string>(prefill?.mrr ? String(prefill.mrr) : "");
  const [planName, setPlanName] = useState(prefill?.plan_name || "");
  const [productName, setProductName] = useState(prefill?.product_name || "");
  const [note, setNote] = useState("");

  // Reset when prefill changes
  const key = prefill?.email + (prefill?.subscription_id || "");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setArea(prefill?.area && prefill.area !== "desconhecida" ? prefill.area : "Sales");
    setMrr(prefill?.mrr ? String(prefill.mrr) : "");
    setPlanName(prefill?.plan_name || "");
    setProductName(prefill?.product_name || "");
    setNote("");
  }

  if (!prefill) return null;

  async function handleSave() {
    const mrrNum = Number(String(mrr).replace(",", "."));
    if (!(mrrNum > 0)) {
      toast.error("Informe um MRR maior que zero");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-force-conversion", {
        body: {
          email: prefill.email,
          area,
          mrr: mrrNum,
          plan_name: planName || null,
          product_name: productName || null,
          subscription_id: prefill.subscription_id || null,
          customer_id: prefill.customer_id || null,
          price_id: prefill.price_id || null,
          registered_at: prefill.registered_at || null,
          converted_at: prefill.converted_at || new Date().toISOString(),
          note,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Conversão registrada manualmente");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao registrar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forçar registro de conversão</DialogTitle>
          <DialogDescription>
            Grava uma conversão manualmente para <strong>{prefill.email}</strong>. Ela passa a contar em Metas e
            Conversões por Área.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Área</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>MRR (R$)</Label>
              <Input type="number" step="0.01" value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Plano</Label>
            <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Ex: +Resultado" />
          </div>
          <div className="space-y-1">
            <Label>Produto / Oferta</Label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="space-y-1">
            <Label>Nota (trilha de auditoria)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Por que essa conversão foi registrada manualmente?" />
          </div>
          {prefill.subscription_id && (
            <p className="text-xs text-muted-foreground">
              Vinculado à assinatura Stripe <code className="font-mono">{prefill.subscription_id}</code>.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
