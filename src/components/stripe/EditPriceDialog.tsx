import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export interface PriceEditTarget {
  conversion_id: string;
  email: string | null;
  area: string;
  price_id: string | null;
  product_name?: string | null;
  plan_name?: string | null;
}

const DEFAULT_AREAS = ["Sales", "Marketing", "CX", "Parceria", "Produto", "desconhecida"];
const PAYMENT_TYPES = [
  { value: "mensal", label: "Mensal" },
  { value: "anual_avista", label: "Anual à vista" },
  { value: "anual_mensalizado", label: "Anual mensalizado" },
  { value: "setup", label: "Setup" },
] as const;

type PaymentType = typeof PAYMENT_TYPES[number]["value"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: PriceEditTarget | null;
  areas?: string[];
  onSaved: () => void;
}

interface FormState {
  area: string;
  offer_name: string;
  price_name: string;
  plan_name: string;
  payment_type: PaymentType | "none";
  seller_label: string;
  mrr_override: string;
  requires_commission: boolean;
}

const EMPTY: FormState = {
  area: "Sales",
  offer_name: "",
  price_name: "",
  plan_name: "",
  payment_type: "none",
  seller_label: "",
  mrr_override: "",
  requires_commission: false,
};

export function EditPriceDialog({ open, onOpenChange, target, areas, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [mapId, setMapId] = useState<string | null>(null);
  const [applyAll, setApplyAll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const options = Array.from(new Set([...(areas || []), ...DEFAULT_AREAS])).filter(Boolean);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    setApplyAll(!!target.price_id);
    setMapId(null);
    setForm({
      ...EMPTY,
      area: target.area && target.area !== "—" ? target.area : "Sales",
      offer_name: target.product_name || "",
      plan_name: target.plan_name || "",
    });
    if (!target.price_id) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("commission_price_map")
        .select("id, area, offer_name, price_name, plan_name, payment_type, seller_label, mrr_override, requires_commission")
        .eq("price_id", target.price_id!)
        .maybeSingle();
      if (!alive) return;
      setLoading(false);
      if (error) { toast.error("Não foi possível carregar o cadastro deste price"); return; }
      if (!data) return;
      setMapId(data.id);
      setForm({
        area: data.area || (target.area && target.area !== "—" ? target.area : "Sales"),
        offer_name: data.offer_name || target.product_name || "",
        price_name: data.price_name || "",
        plan_name: data.plan_name || target.plan_name || "",
        payment_type: (data.payment_type as PaymentType) || "none",
        seller_label: data.seller_label || "",
        mrr_override: data.mrr_override != null ? String(data.mrr_override) : "",
        requires_commission: !!data.requires_commission,
      });
    })();
    return () => { alive = false; };
  }, [open, target?.conversion_id]);

  if (!target) return null;

  async function handleSave() {
    if (!target) return;
    const mrrRaw = form.mrr_override.replace(",", ".").trim();
    if (mrrRaw && Number.isNaN(Number(mrrRaw))) {
      toast.error("MRR de referência inválido");
      return;
    }
    setSaving(true);
    try {
      if (target.price_id) {
        const payload = {
          area: form.area || null,
          offer_name: form.offer_name.trim() || null,
          price_name: form.price_name.trim() || null,
          plan_name: form.plan_name.trim() || null,
          payment_type: form.payment_type === "none" ? null : form.payment_type,
          seller_label: form.seller_label.trim() || null,
          mrr_override: mrrRaw ? Number(mrrRaw) : null,
          requires_commission: form.requires_commission,
        };
        if (mapId) {
          const { error } = await supabase
            .from("commission_price_map")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", mapId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("commission_price_map")
            .insert({ price_id: target.price_id, ...payload });
          if (error) throw error;
        }

        if (applyAll) {
          const convUpdate: Record<string, unknown> = { area: form.area };
          if (form.offer_name.trim()) convUpdate.product_name = form.offer_name.trim();
          if (form.plan_name.trim()) convUpdate.plan_name = form.plan_name.trim();
          const { error, count } = await supabase
            .from("stripe_conversions")
            .update(convUpdate, { count: "exact" })
            .eq("stripe_price_id", target.price_id);
          if (error) throw error;
          toast.success(`Price atualizado · ${count ?? 0} conversão(ões) sincronizada(s)`);
        } else {
          toast.success("Cadastro do price atualizado");
        }
      } else {
        const convUpdate: Record<string, unknown> = { area: form.area };
        if (form.offer_name.trim()) convUpdate.product_name = form.offer_name.trim();
        if (form.plan_name.trim()) convUpdate.plan_name = form.plan_name.trim();
        const { error } = await supabase
          .from("stripe_conversions")
          .update(convUpdate)
          .eq("id", target.conversion_id);
        if (error) throw error;
        toast.success("Conversão atualizada");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar o price");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar price</DialogTitle>
          <DialogDescription>
            Conversão de <strong>{target.email || "—"}</strong>
            {target.price_id ? <> · price <span className="font-mono text-xs">{target.price_id}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadastro…
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Área</Label>
                <Select value={form.area} onValueChange={(v) => set("area", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de pagamento</Label>
                <Select value={form.payment_type} onValueChange={(v) => set("payment_type", v as PaymentType | "none")}>
                  <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definido</SelectItem>
                    {PAYMENT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Oferta / produto</Label>
                <Input value={form.offer_name} onChange={(e) => set("offer_name", e.target.value)} placeholder="Ex.: Yampa Pro" />
              </div>
              <div className="space-y-1">
                <Label>Plano</Label>
                <Input value={form.plan_name} onChange={(e) => set("plan_name", e.target.value)} placeholder="Ex.: Mensal" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome do price</Label>
                <Input value={form.price_name} onChange={(e) => set("price_name", e.target.value)} placeholder="Nome interno" />
              </div>
              <div className="space-y-1">
                <Label>Vendedor (rótulo)</Label>
                <Input value={form.seller_label} onChange={(e) => set("seller_label", e.target.value)} placeholder="Ex.: Time Sales" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>MRR de referência</Label>
                <Input
                  value={form.mrr_override}
                  onChange={(e) => set("mrr_override", e.target.value)}
                  placeholder="Ex.: 279,02"
                  inputMode="decimal"
                />
              </div>
              <label className="flex items-center gap-2 text-sm pb-2">
                <Checkbox
                  checked={form.requires_commission}
                  onCheckedChange={(v) => set("requires_commission", !!v)}
                />
                <span>Gera comissão</span>
              </label>
            </div>

            {target.price_id ? (
              <label className="flex items-start gap-2 text-sm border-t pt-3">
                <Checkbox checked={applyAll} onCheckedChange={(v) => setApplyAll(!!v)} />
                <span>
                  Aplicar área, oferta e plano a todas as conversões deste price. O cadastro (de-para) é sempre salvo,
                  então novas conversões já vêm corrigidas.
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Esta conversão não tem price no Stripe, então os ajustes valem apenas para este registro.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
