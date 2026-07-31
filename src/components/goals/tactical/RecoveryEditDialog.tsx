import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Profile } from "./types";

export interface EditableRecovery {
  kind: "recovery" | "manual_entry";
  rawId: string;
  customer_name: string;
  customer_email: string;
  plan_name: string;
  seller_id: string;
  date: string;
  price: string;
  mrr: string;
  qty: string;
  note: string;
  entry_kind: "recovered" | "retained";
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function RecoveryEditDialog({
  entry,
  profiles,
  onClose,
  onSaved,
}: {
  entry: EditableRecovery | null;
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EditableRecovery | null>(entry);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(entry), [entry]);

  if (!form) return null;
  const isManualEntry = form.kind === "manual_entry";

  async function save() {
    if (!form) return;
    setSaving(true);
    let error: { message: string } | null = null;

    if (form.kind === "manual_entry") {
      const res = await supabase
        .from("tactical_manual_entries")
        .update({
          entry_date: form.date,
          value: toNumber(form.qty),
          mrr_value: toNumber(form.mrr),
          note: form.note || null,
          entry_kind: form.entry_kind,
          user_id: form.seller_id || undefined,
        })
        .eq("id", form.rawId);
      error = res.error;
    } else {
      const res = await supabase
        .from("tactical_recoveries")
        .update({
          customer_name: form.customer_name || null,
          customer_email: form.customer_email ? form.customer_email.toLowerCase().trim() : null,
          plan_name: form.plan_name || null,
          seller_id: form.seller_id || null,
          recovered_at: form.date,
          price: toNumber(form.price),
          mrr: toNumber(form.mrr),
          note: form.note || null,
          entry_kind: form.entry_kind,
        })
        .eq("id", form.rawId);
      error = res.error;
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registro atualizado" });
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar recuperação</DialogTitle>
          <DialogDescription>
            {isManualEntry
              ? "Lançamento manual do painel tático (quantidade e MRR)."
              : "Registro detalhado de cliente recuperado."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {!isManualEntry && (
            <>
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Plano</Label>
                <Input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Preço (R$)</Label>
                <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Select value={form.seller_id} onValueChange={(v) => setForm({ ...form, seller_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          {isManualEntry && (
            <div className="space-y-1">
              <Label>Qtd. clientes</Label>
              <Input inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
          )}
          <div className="space-y-1">
            <Label>MRR recuperado (R$)</Label>
            <Input inputMode="decimal" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Observação</Label>
          <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
