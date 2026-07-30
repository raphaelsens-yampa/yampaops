import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Profile, TacticalGoal, TacticalMetric, Team, toBRDateKey } from "./types";

interface Props {
  metrics: TacticalMetric[];
  profiles: Profile[];
  teams: Team[];
  goals: TacticalGoal[];
  onChanged: () => void;
}

export function TacticalGoalsManager({ metrics, profiles, teams, goals, onChanged }: Props) {
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
    await supabase.from("tactical_goals").delete().eq("id", id);
    onChanged();
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
                  <Button variant="ghost" size="icon" onClick={() => del(g.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {goals.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma meta cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
