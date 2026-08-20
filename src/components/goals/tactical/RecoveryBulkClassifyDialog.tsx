import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { CHANNEL_LABEL, RecoveryChannel, RecoveryReason, reasonsForChannel } from "./recoveryChannels";
import { ManageReasonsButton } from "./ManageReasonsButton";

export interface BulkTarget {
  rawId: string;
  table: "tactical_recoveries" | "tactical_manual_entries";
  channel: RecoveryChannel;
}

/** Classificação em lote (canal e/ou motivo) dos registros selecionados. */
export function RecoveryBulkClassifyDialog({
  targets,
  reasons,
  open,
  onClose,
  onSaved,
  onReasonsChanged,
}: {
  targets: BulkTarget[];
  reasons: RecoveryReason[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onReasonsChanged?: () => void;
}) {
  const [channel, setChannel] = useState<"keep" | RecoveryChannel>("keep");
  const [reasonId, setReasonId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setChannel("keep");
      setReasonId("");
    }
  }, [open]);

  // Quando o canal é mantido, oferece todos os motivos ativos; senão filtra pelo canal escolhido.
  const options =
    channel === "keep" ? reasons.filter((r) => r.active) : reasonsForChannel(reasons, channel);

  async function save() {
    if (channel === "keep" && !reasonId) {
      toast({ title: "Escolha um canal ou um motivo para aplicar", variant: "destructive" });
      return;
    }
    setSaving(true);
    const values: Record<string, unknown> = {};
    if (channel !== "keep") values.recovery_channel = channel;
    if (reasonId) values.reason_id = reasonId;

    const groups: Record<string, string[]> = {};
    for (const t of targets) {
      (groups[t.table] ||= []).push(t.rawId);
    }

    let failed = false;
    for (const [table, ids] of Object.entries(groups)) {
      const { error } = await supabase
        .from(table as any)
        .update(values)
        .in("id", ids);
      if (error) {
        failed = true;
        toast({ title: "Erro ao classificar", description: error.message, variant: "destructive" });
      }
    }
    setSaving(false);
    if (failed) return;
    toast({
      title: "Registros classificados",
      description: `${targets.length} ${targets.length === 1 ? "registro atualizado" : "registros atualizados"}.`,
    });
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Definir canal/motivo em lote</DialogTitle>
          <DialogDescription>
            Aplicando a {targets.length} {targets.length === 1 ? "registro selecionado" : "registros selecionados"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Manter o canal atual</SelectItem>
                <SelectItem value="cobranca">{CHANNEL_LABEL.cobranca}</SelectItem>
                <SelectItem value="cs">{CHANNEL_LABEL.cs}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Motivo</Label>
              <ManageReasonsButton onChanged={onReasonsChanged} />
            </div>
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
              <SelectContent>
                {options.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Sem seleção, o motivo atual de cada registro é preservado.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || targets.length === 0}>
            {saving ? "Aplicando..." : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
