import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export interface AreaTarget {
  conversion_id: string;
  email: string | null;
  area: string;
  price_id: string | null;
  product_name?: string | null;
  plan_name?: string | null;
}

const DEFAULT_AREAS = ["Sales", "Marketing", "CX", "Parceria", "Produto", "desconhecida"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: AreaTarget | null;
  areas?: string[];
  onSaved: () => void;
}

export function EditAreaDialog({ open, onOpenChange, target, areas, onSaved }: Props) {
  const [area, setArea] = useState("Sales");
  const [applyAll, setApplyAll] = useState(true);
  const [saving, setSaving] = useState(false);

  const options = Array.from(new Set([...(areas || []), ...DEFAULT_AREAS])).filter(Boolean);

  useEffect(() => {
    if (!target) return;
    setArea(target.area && target.area !== "—" ? target.area : "Sales");
    setApplyAll(!!target.price_id);
  }, [target?.conversion_id]);

  if (!target) return null;

  async function handleSave() {
    if (!target) return;
    setSaving(true);
    try {
      if (applyAll && target.price_id) {
        // 1) Cadastro canônico do price (de-para)
        const { data: existing, error: selErr } = await supabase
          .from("commission_price_map")
          .select("id, offer_name, plan_name")
          .eq("price_id", target.price_id)
          .maybeSingle();
        if (selErr) throw selErr;

        if (existing) {
          const { error } = await supabase
            .from("commission_price_map")
            .update({
              area,
              offer_name: existing.offer_name || target.product_name || null,
              plan_name: existing.plan_name || target.plan_name || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("commission_price_map").insert({
            price_id: target.price_id,
            area,
            offer_name: target.product_name || null,
            plan_name: target.plan_name || null,
          });
          if (error) throw error;
        }

        // 2) Todas as conversões desse price passam a refletir a área
        const { error: updErr, count } = await supabase
          .from("stripe_conversions")
          .update({ area }, { count: "exact" })
          .eq("stripe_price_id", target.price_id);
        if (updErr) throw updErr;
        toast.success(`Área definida como "${area}" · ${count ?? 0} conversão(ões) atualizada(s)`);
      } else {
        const { error } = await supabase
          .from("stripe_conversions")
          .update({ area })
          .eq("id", target.conversion_id);
        if (error) throw error;
        toast.success(`Área desta conversão definida como "${area}"`);
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar a área");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definir área</DialogTitle>
          <DialogDescription>
            Conversão de <strong>{target.email || "—"}</strong>
            {target.price_id ? <> · price <span className="font-mono text-xs">{target.price_id}</span></> : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>Área</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {target.price_id ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={applyAll} onCheckedChange={(v) => setApplyAll(!!v)} />
              <span>
                Aplicar a todas as conversões deste price e salvar no cadastro (de-para), para novas conversões já
                vierem com essa área.
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              Esta conversão não tem price no Stripe, então a área é ajustada apenas neste registro.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
