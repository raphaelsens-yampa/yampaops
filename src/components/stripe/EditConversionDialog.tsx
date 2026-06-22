import { useEffect, useState } from "react";
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

export interface ConversionToEdit {
  conversion_id: string;
  email: string;
  area?: string | null;
  mrr?: number | null;
  plan_name?: string | null;
  product_name?: string | null;
  converted_at?: string | null;
  registered_at?: string | null;
  subscription_id?: string | null;
  customer_id?: string | null;
  price_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversion: ConversionToEdit | null;
  onSaved: () => void;
}

const AREAS = ["Sales", "Marketing", "CX", "Parceria", "Produto", "desconhecida"];

function toDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EditConversionDialog({ open, onOpenChange, conversion, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [area, setArea] = useState("");
  const [mrr, setMrr] = useState("");
  const [planName, setPlanName] = useState("");
  const [productName, setProductName] = useState("");
  const [convertedAt, setConvertedAt] = useState("");
  const [registeredAt, setRegisteredAt] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!conversion) return;
    setArea(conversion.area || "Sales");
    setMrr(conversion.mrr != null ? String(conversion.mrr) : "");
    setPlanName(conversion.plan_name || "");
    setProductName(conversion.product_name || "");
    setConvertedAt(toDateInput(conversion.converted_at));
    setRegisteredAt(toDateInput(conversion.registered_at));
    setNote("");
  }, [conversion?.conversion_id]);

  if (!conversion) return null;

  async function handleSave() {
    if (!conversion) return;
    if (!note.trim()) {
      toast.error("Informe a justificativa da alteração");
      return;
    }
    const mrrNum = Number(String(mrr).replace(",", "."));
    if (!(mrrNum > 0)) {
      toast.error("MRR deve ser maior que zero");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-update-conversion", {
        body: {
          conversion_id: conversion.conversion_id,
          area,
          mrr: mrrNum,
          plan_name: planName || null,
          product_name: productName || null,
          converted_at: convertedAt ? new Date(convertedAt).toISOString() : null,
          registered_at: registeredAt ? new Date(registeredAt).toISOString() : null,
          note: note.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Conversão atualizada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Auditar / editar conversão</DialogTitle>
          <DialogDescription>
            Ajuste os campos da conversão de <strong>{conversion.email}</strong>. A alteração é registrada em trilha
            de auditoria.
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
              <Input type="number" step="0.01" value={mrr} onChange={(e) => setMrr(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Plano</Label>
              <Input value={planName} onChange={(e) => setPlanName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Produto / Oferta</Label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data de conversão</Label>
              <Input type="date" value={convertedAt} onChange={(e) => setConvertedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data de cadastro</Label>
              <Input type="date" value={registeredAt} onChange={(e) => setRegisteredAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Justificativa (obrigatória)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Por que essa conversão está sendo ajustada?" />
          </div>
          <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-0.5 font-mono">
            <div>conversion_id: {conversion.conversion_id}</div>
            {conversion.subscription_id && <div>subscription: {conversion.subscription_id}</div>}
            {conversion.price_id && <div>price: {conversion.price_id}</div>}
            {conversion.customer_id && <div>customer: {conversion.customer_id}</div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
