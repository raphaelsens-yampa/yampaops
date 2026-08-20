import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TacticalMetric, Profile, toBRDateKey } from "./types";
import { CHANNEL_LABEL, RecoveryChannel, reasonsForChannel, useRecoveryReasons } from "./recoveryChannels";

interface Props {
  metrics: TacticalMetric[];
  profiles?: Profile[];
  memberIds?: string[];
  defaultUserId?: string;
  onSaved: () => void;
}

export function ManualEntryDialog({ metrics, profiles = [], memberIds = [], defaultUserId, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState<string>(defaultUserId || "");
  const [metricId, setMetricId] = useState<string>("");
  const [date, setDate] = useState<string>(toBRDateKey(new Date()));
  const [value, setValue] = useState<string>("");
  const [mrrValue, setMrrValue] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [entryKind, setEntryKind] = useState<"recovered" | "retained">("recovered");
  const [channel, setChannel] = useState<RecoveryChannel>("cs");
  const [reasonId, setReasonId] = useState<string>("");
  const { reasons, reload: reloadReasons } = useRecoveryReasons();

  const selectedMetric = metrics.find((m) => m.id === metricId);
  const isRetidos = selectedMetric?.key === "clientes_retidos";
  const isRecuperados = selectedMetric?.key === "clientes_recuperados" || isRetidos;
  const hasMrrField =
    isRecuperados ||
    selectedMetric?.key === "upsell_dia" ||
    selectedMetric?.key === "recuperados_ft";
  const kind: "recovered" | "retained" = isRetidos ? "retained" : entryKind;

  const teamProfiles = profiles.filter((p) => !memberIds.length || memberIds.includes(p.user_id));

  const availableReasons = reasonsForChannel(reasons, channel);

  async function save() {
    if (!metricId || !value || !user) return;
    if (isRecuperados && channel === "cs" && !reasonId) {
      toast({ title: "Informe o motivo", description: "Registros via CS exigem o motivo da recuperação/retenção.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("tactical_manual_entries").insert({
      metric_id: metricId,
      user_id: ownerId || user.id,
      entry_date: date,
      value: parseFloat(value),
      mrr_value: hasMrrField && mrrValue ? parseFloat(mrrValue) : 0,
      entry_kind: isRecuperados ? kind : "recovered",
      recovery_channel: isRecuperados ? channel : null,
      reason_id: isRecuperados && reasonId ? reasonId : null,
      note: note || null,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Registro lançado" });
    setOpen(false);
    setMetricId(""); setValue(""); setMrrValue(""); setNote(""); setEntryKind("recovered"); setChannel("cs"); setReasonId("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="h-4 w-4 mr-1" /> Lançar realizado</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Lançar realizado do dia</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Métrica</Label>
            <Select value={metricId} onValueChange={setMetricId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {metrics
                  .filter(
                    (m) =>
                      m.source !== "stripe_mrr" &&
                      m.source !== "stripe_deals" &&
                      m.key !== "upsell_dia" &&
                      m.key !== "recuperados_ft" &&
                      m.source !== "ac_stage_move",

                  )
                  .map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Vendas do dia e Recuperados FT vêm do Stripe (hoje) e do Metabase (dias anteriores). Upsell vem do Metabase (D-1). Recuperados/Retidos do CS são lançados aqui.</p>

          </div>
          {teamProfiles.length > 0 && (
            <div>
              <Label>Responsável</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {teamProfiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {isRecuperados && (
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setEntryKind(v as "recovered" | "retained")} disabled={isRetidos}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recovered">Cliente recuperado</SelectItem>
                  <SelectItem value="retained">Cliente retido</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Recuperado: cliente que havia cancelado e voltou. Retido: cliente que pediu cancelamento e foi mantido.
              </p>
            </div>
          )}
          {isRecuperados && (
            <>
              <div>
                <Label>Canal</Label>
                <Select value={channel} onValueChange={(v) => { setChannel(v as RecoveryChannel); setReasonId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobranca">{CHANNEL_LABEL.cobranca} (Stripe)</SelectItem>
                    <SelectItem value="cs">{CHANNEL_LABEL.cs} (ação humana)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Cobrança: a retentativa/cobrança forçada no Stripe recuperou o MRR. CS: ação do time.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Motivo{channel === "cs" ? "" : " (opcional)"}</Label>
                  <ManageReasonsButton onChanged={reloadReasons} />
                </div>
                <Select value={reasonId} onValueChange={setReasonId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {availableReasons.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div>
            <Label>{hasMrrField ? "Quantidade de clientes" : "Valor"}</Label>
            <Input type="number" step={hasMrrField ? "1" : "0.01"} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          {hasMrrField && (
            <div>
              <Label>{isRecuperados ? (kind === "retained" ? "MRR retido" : "MRR recuperado") : "MRR gerado"}</Label>
              <Input type="number" step="0.01" value={mrrValue} onChange={(e) => setMrrValue(e.target.value)} />
            </div>
          )}
          <div><Label>Observação (opcional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button onClick={save} className="w-full">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
