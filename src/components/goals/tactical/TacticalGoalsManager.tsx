import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Plus, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Profile, TacticalGoal, TacticalMetric, Team, toBRDateKey } from "./types";


interface Props {
  metrics: TacticalMetric[];
  profiles: Profile[];
  teams: Team[];
  goals: TacticalGoal[];
  onChanged: () => void;
}

interface EditForm {
  id: string;
  metric_id: string;
  scope: "all" | "team" | "user";
  team_id: string;
  user_id: string;
  daily_target: string;
  period_start: string;
  period_end: string;
}

export function TacticalGoalsManager({ metrics, profiles, teams, goals, onChanged }: Props) {
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const [metricId, setMetricId] = useState("");
  const [scope, setScope] = useState<"all" | "team" | "user">("team");
  const [teamId, setTeamId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [target, setTarget] = useState("");
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [start, setStart] = useState(toBRDateKey(monthStart));
  const [end, setEnd] = useState(toBRDateKey(monthEnd));

  async function addGoal() {
    if (!metricId || !target || !start || !end) return;
    if (scope === "team" && !teamId) return;
    if (scope === "user" && !userId) return;

    // Evita metas duplicadas para o mesmo escopo/período: substitui as existentes
    const dupes = goals.filter(
      (g) =>
        g.metric_id === metricId &&
        (scope === "user" ? g.user_id === userId : !g.user_id) &&
        (scope === "team" ? g.team_id === teamId : !g.team_id) &&
        String(g.period_start).slice(0, 10) <= end &&
        String(g.period_end).slice(0, 10) >= start,
    );
    if (dupes.length) {
      const { error: delErr } = await supabase
        .from("tactical_goals")
        .delete()
        .in("id", dupes.map((g) => g.id));
      if (delErr) { toast({ title: "Erro", description: delErr.message, variant: "destructive" }); return; }
    }

    const { error } = await supabase.from("tactical_goals").insert({
      metric_id: metricId,
      user_id: scope === "user" ? userId : null,
      team_id: scope === "team" ? teamId : null,
      daily_target: parseFloat(target),
      period_start: start,
      period_end: end,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setTarget("");
    onChanged();
    toast({ title: "Meta diária cadastrada" });
  }

  async function del(id: string) {
    const { error } = await supabase.from("tactical_goals").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    onChanged();
    toast({ title: "Meta diária excluída" });
  }

  function startEdit(g: TacticalGoal) {
    setEditing({
      id: g.id,
      metric_id: g.metric_id,
      scope: g.user_id ? "user" : g.team_id ? "team" : "all",
      team_id: g.team_id || "",
      user_id: g.user_id || "",
      daily_target: String(g.daily_target ?? ""),
      period_start: String(g.period_start).slice(0, 10),
      period_end: String(g.period_end).slice(0, 10),
    });
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.metric_id || !editing.daily_target || !editing.period_start || !editing.period_end) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (editing.scope === "team" && !editing.team_id) {
      toast({ title: "Selecione o time", variant: "destructive" });
      return;
    }
    if (editing.scope === "user" && !editing.user_id) {
      toast({ title: "Selecione a pessoa", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("tactical_goals")
      .update({
        metric_id: editing.metric_id,
        user_id: editing.scope === "user" ? editing.user_id : null,
        team_id: editing.scope === "team" ? editing.team_id : null,
        daily_target: parseFloat(editing.daily_target),
        period_start: editing.period_start,
        period_end: editing.period_end,
      } as any)
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(null);
    onChanged();
    toast({ title: "Meta diária atualizada" });
  }


  function scopeLabel(g: TacticalGoal) {
    if (g.user_id) return profiles.find((p) => p.user_id === g.user_id)?.full_name || "—";
    if (g.team_id) return `Time ${teams.find((t) => t.id === g.team_id)?.name ?? "—"}`;
    return "Equipe toda";
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Metas diárias</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
          <div>
            <Label className="text-xs">Métrica</Label>
            <Select value={metricId} onValueChange={setMetricId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Escopo</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Equipe toda</SelectItem>
                <SelectItem value="team">Time</SelectItem>
                <SelectItem value="user">Pessoa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{scope === "user" ? "Pessoa" : "Time"}</Label>
            {scope === "user" ? (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Select value={teamId} onValueChange={setTeamId} disabled={scope === "all"}>
                <SelectTrigger><SelectValue placeholder={scope === "all" ? "—" : "Selecione"} /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div><Label className="text-xs">Meta/dia</Label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <div><Label className="text-xs">Início</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label className="text-xs">Fim</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button onClick={addGoal}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Métrica</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead className="text-right">Meta/dia</TableHead>
              <TableHead>Período</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{metrics.find((m) => m.id === g.metric_id)?.label ?? "—"}</TableCell>
                <TableCell>{scopeLabel(g)}</TableCell>
                <TableCell className="text-right">{g.daily_target}</TableCell>
                <TableCell className="text-sm">{g.period_start} → {g.period_end}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar meta" onClick={() => startEdit(g)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir meta" onClick={() => del(g.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {goals.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma meta cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar meta diária</DialogTitle>
            <DialogDescription>Ajuste métrica, escopo, meta por dia e período de vigência.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Métrica</Label>
                <Select value={editing.metric_id} onValueChange={(v) => setEditing({ ...editing, metric_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {metrics.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Escopo</Label>
                <Select
                  value={editing.scope}
                  onValueChange={(v) => setEditing({ ...editing, scope: v as EditForm["scope"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Equipe toda</SelectItem>
                    <SelectItem value="team">Time</SelectItem>
                    <SelectItem value="user">Pessoa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.scope !== "all" && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">{editing.scope === "user" ? "Pessoa" : "Time"}</Label>
                  {editing.scope === "user" ? (
                    <Select value={editing.user_id} onValueChange={(v) => setEditing({ ...editing, user_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={editing.team_id} onValueChange={(v) => setEditing({ ...editing, team_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Meta/dia</Label>
                <Input
                  type="number"
                  value={editing.daily_target}
                  onChange={(e) => setEditing({ ...editing, daily_target: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input
                  type="date"
                  value={editing.period_start}
                  onChange={(e) => setEditing({ ...editing, period_start: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input
                  type="date"
                  value={editing.period_end}
                  onChange={(e) => setEditing({ ...editing, period_end: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Card>
  );
}
