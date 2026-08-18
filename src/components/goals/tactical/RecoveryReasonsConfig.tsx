import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CHANNEL_LABEL, RecoveryReason } from "./recoveryChannels";

export function RecoveryReasonsConfig({
  reasons,
  onChanged,
}: {
  reasons: RecoveryReason[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"cobranca" | "cs" | "ambos">("ambos");
  const [saving, setSaving] = useState(false);

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
    onChanged();
  }

  async function toggleActive(r: RecoveryReason, active: boolean) {
    const { error } = await supabase.from("tactical_recovery_reasons").update({ active }).eq("id", r.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
  }

  async function rename(r: RecoveryReason, newName: string) {
    if (!newName.trim() || newName === r.name) return;
    const { error } = await supabase
      .from("tactical_recovery_reasons")
      .update({ name: newName.trim() })
      .eq("id", r.id);
    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
  }

  async function updateChannel(r: RecoveryReason, value: "cobranca" | "cs" | "ambos") {
    const { error } = await supabase.from("tactical_recovery_reasons").update({ channel: value }).eq("id", r.id);
    if (error) {
      toast({ title: "Erro ao atualizar canal", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
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
    onChanged();
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="px-4 md:px-6">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-start gap-2 text-left w-full">
              <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">Motivos de recuperação/retenção</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Lista parametrizável usada nos lançamentos de clientes recuperados e retidos.
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto shrink-0">
                {reasons.filter((r) => r.active).length} ativos
              </Badge>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-4 md:px-6 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Novo motivo (ex.: Cartão atualizado)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sm:flex-1"
              />
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
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
                      onBlur={(e) => rename(r, e.target.value)}
                      className="h-9 sm:flex-1"
                    />
                    <Select value={r.channel} onValueChange={(v) => updateChannel(r, v as typeof r.channel)}>
                      <SelectTrigger className="h-9 sm:w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ambos">Ambos os canais</SelectItem>
                        <SelectItem value="cobranca">{CHANNEL_LABEL.cobranca}</SelectItem>
                        <SelectItem value="cs">{CHANNEL_LABEL.cs}</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={r.active} onCheckedChange={(v) => toggleActive(r, v)} />
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
