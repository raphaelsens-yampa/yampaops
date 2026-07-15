import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Loader2, Wand2 } from "lucide-react";

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
  conversion_type?: string | null;
  previous_mrr?: number | null;
  previous_price_id?: string | null;
  assigned_seller_id?: string | null;
  attribution_source?: string | null;
  gross_amount?: number | null;
  net_amount?: number | null;
  discount_amount?: number | null;
  mrr_net?: number | null;
  coupon_id?: string | null;
  coupon_name?: string | null;
  promotion_code?: string | null;
  discount_duration?: string | null;
  stripe_invoice_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversion: ConversionToEdit | null;
  onSaved: () => void;
}

const AREAS = ["Sales", "Marketing", "CX", "Parceria", "Produto", "desconhecida"];
const TYPES: { value: string; label: string }[] = [
  { value: "new", label: "Nova" },
  { value: "upsell", label: "Upsell" },
  { value: "downgrade", label: "Downgrade" },
  { value: "renewal", label: "Renovação" },
];

function toDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EditConversionDialog({ open, onOpenChange, conversion, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [area, setArea] = useState("");
  const [mrr, setMrr] = useState("");
  const [planName, setPlanName] = useState("");
  const [productName, setProductName] = useState("");
  const [convertedAt, setConvertedAt] = useState("");
  const [registeredAt, setRegisteredAt] = useState("");
  const [conversionType, setConversionType] = useState("new");
  const [previousMrr, setPreviousMrr] = useState("");
  const [assignedSeller, setAssignedSeller] = useState<string>("__none__");
  const [note, setNote] = useState("");

  const { data: sellers = [] } = useQuery({
    queryKey: ["profiles-for-edit-conversion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return (data || []) as { user_id: string; full_name: string | null; email: string | null }[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!conversion) return;
    setArea(conversion.area || "Sales");
    setMrr(conversion.mrr != null ? String(conversion.mrr) : "");
    setPlanName(conversion.plan_name || "");
    setProductName(conversion.product_name || "");
    setConvertedAt(toDateInput(conversion.converted_at));
    setRegisteredAt(toDateInput(conversion.registered_at));
    setConversionType(conversion.conversion_type || "new");
    setPreviousMrr(conversion.previous_mrr != null ? String(conversion.previous_mrr) : "0");
    setAssignedSeller(conversion.assigned_seller_id || "__none__");
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
    const prevMrrNum = Number(String(previousMrr).replace(",", "."));
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
          conversion_type: conversionType,
          previous_mrr: isFinite(prevMrrNum) ? prevMrrNum : 0,
          assigned_seller_id: assignedSeller === "__none__" ? null : assignedSeller,
          attribution_source: assignedSeller === "__none__" ? null : "manual",
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

  async function handleAutoResolve() {
    if (!conversion) return;
    if (!note.trim()) {
      toast.error("Informe a justificativa antes de re-atribuir automaticamente");
      return;
    }
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-update-conversion", {
        body: {
          conversion_id: conversion.conversion_id,
          resolve_seller: true,
          note: note.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Vendedor re-atribuído automaticamente");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao re-atribuir");
    } finally {
      setResolving(false);
    }
  }

  const deltaMrr = (Number(mrr) || 0) - (Number(previousMrr) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Label>Tipo</Label>
              <Select value={conversionType} onValueChange={setConversionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Área</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>MRR novo (R$)</Label>
              <Input type="number" step="0.01" value={mrr} onChange={(e) => setMrr(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>MRR anterior (R$)</Label>
              <Input type="number" step="0.01" value={previousMrr} onChange={(e) => setPreviousMrr(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Δ MRR (calculado)</Label>
              <Input value={deltaMrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} readOnly tabIndex={-1} />
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
            <Label>Vendedor atribuído</Label>
            <div className="flex gap-2">
              <Select value={assignedSeller} onValueChange={setAssignedSeller}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem vendedor —</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.full_name || s.email || s.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={handleAutoResolve} disabled={resolving || saving} title="Tentar atribuir automaticamente (Chatwoot / Campanhas / Histórico)">
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
            {conversion.attribution_source && (
              <p className="text-[11px] text-muted-foreground">Fonte atual: {conversion.attribution_source}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Justificativa (obrigatória)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Por que essa conversão está sendo ajustada?" />
          </div>
          <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-0.5 font-mono">
            <div>conversion_id: {conversion.conversion_id}</div>
            {conversion.subscription_id && <div>subscription: {conversion.subscription_id}</div>}
            {conversion.price_id && <div>price: {conversion.price_id}</div>}
            {conversion.previous_price_id && <div>price anterior: {conversion.previous_price_id}</div>}
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
