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

  const selectedMetric = metrics.find((m) => m.id === metricId);
  const isRetidos = selectedMetric?.key === "clientes_retidos";
  const isRecuperados = selectedMetric?.key === "clientes_recuperados" || isRetidos;
  const hasMrrField =
    isRecuperados ||
    selectedMetric?.key === "upsell_dia" ||
    selectedMetric?.key === "recuperados_ft";
  const kind: "recovered" | "retained" = isRetidos ? "retained" : entryKind;

  const teamProfiles = profiles.filter((p) => !memberIds.length || memberIds.includes(p.user_id));

  async function save() {
    if (!metricId || !value || !user) return;
    const { error } = await supabase.from("tactical_manual_entries").insert({
      metric_id: metricId,
      user_id: ownerId || user.id,
      entry_date: date,
      value: parseFloat(value),
      mrr_value: hasMrrField && mrrValue ? parseFloat(mrrValue) : 0,
      entry_kind: isRecuperados ? kind : "recovered",
      note: note || null,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Registro lançado" });
    setOpen(false);
    setMetricId(""); setValue(""); setMrrValue(""); setNote(""); setEntryKind("recovered");
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
                  .filter((m) => m.source !== "stripe_mrr" && m.source !== "stripe_deals")
                  .map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Vendas e MRR do dia são calculados automaticamente pelo Stripe. Recuperações do CS somam o automático (reativações) com o que você lançar aqui.</p>

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
