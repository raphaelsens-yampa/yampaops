import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CHANNEL_LABEL, RecoveryReason, useRecoveryReasons } from "./recoveryChannels";

/**
 * Botão compacto para gerenciar (incluir/editar/excluir) os motivos de
 * recuperação/retenção direto de dentro dos painéis de registro.
 */
export function ManageReasonsButton({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const { reasons, reload } = useRecoveryReasons();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"cobranca" | "cs" | "ambos">("ambos");
  const [saving, setSaving] = useState(false);

  function refresh() {
    reload();
    onChanged?.();
  }

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    const maxOrder = reasons.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await supabase
      .from("tactical_recovery_reasons")
      .insert({ name: name.trim(), channel, sort_order: maxOrder + 10 });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar motivo", description: error.message, variant: "destructive" });
      return;
    }
    setName("");
    refresh();
  }

  async function patch(r: RecoveryReason, values: Partial<RecoveryReason>) {
    const { error } = await supabase.from("tactical_recovery_reasons").update(values).eq("id", r.id);
    if (error) {
      toast({ title: "Erro ao atualizar motivo", description: error.message, variant: "destructive" });
      return;
    }
    refresh();
  }

  async function remove(r: RecoveryReason) {
    const { error } = await supabase.from("tactical_recovery_reasons").delete().eq("id", r.id);
    if (error) {
      toast({
        title: "Não foi possível remover",
        description: "O motivo pode estar em uso. Desative-o em vez de remover.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Motivo removido" });
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Settings2 className="h-3.5 w-3.5 mr-1" /> Gerenciar motivos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Motivos de recuperação/retenção</DialogTitle>
          <DialogDescription>
            Inclua, renomeie, ative/desative ou exclua os motivos disponíveis nos lançamentos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Novo motivo (ex.: Cartão atualizado)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="sm:flex-1"
          />
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">Ambos os canais</SelectItem>
              <SelectItem value="cobranca">{CHANNEL_LABEL.cobranca}</SelectItem>
              <SelectItem value="cs">{CHANNEL_LABEL.cs}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={create} disabled={saving || !name.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        <div className="divide-y rounded-md border">
          {reasons.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Nenhum motivo cadastrado.</p>
          ) : (
            reasons.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <Input
                  defaultValue={r.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== r.name) patch(r, { name: v });
                  }}
                  className="h-9 sm:flex-1"
                />
                <Select value={r.channel} onValueChange={(v) => patch(r, { channel: v as RecoveryReason["channel"] })}>
                  <SelectTrigger className="h-9 sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambos">Ambos os canais</SelectItem>
                    <SelectItem value="cobranca">{CHANNEL_LABEL.cobranca}</SelectItem>
                    <SelectItem value="cs">{CHANNEL_LABEL.cs}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={r.active} onCheckedChange={(v) => patch(r, { active: v })} />
                    <span className="text-xs text-muted-foreground">{r.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
