import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TacticalGoal, TacticalMetric, toBRDateKey } from "./types";

interface Props {
  metrics: TacticalMetric[];
  profiles: { user_id: string; full_name: string | null }[];
  goals: TacticalGoal[];
  onChanged: () => void;
}

export function TacticalGoalsManager({ metrics, profiles, goals, onChanged }: Props) {
  const { toast } = useToast();
  const [metricId, setMetricId] = useState("");
  const [userId, setUserId] = useState<string>("all");
  const [target, setTarget] = useState("");
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [start, setStart] = useState(toBRDateKey(monthStart));
  const [end, setEnd] = useState(toBRDateKey(monthEnd));

  async function addGoal() {
    if (!metricId || !target || !start || !end) return;
    const { error } = await supabase.from("tactical_goals").insert({
      metric_id: metricId,
      user_id: userId === "all" ? null : userId,
      daily_target: parseFloat(target),
      period_start: start,
      period_end: end,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setTarget("");
    onChanged();
    toast({ title: "Meta diária cadastrada" });
  }

  async function del(id: string) {
    await supabase.from("tactical_goals").delete().eq("id", id);
    onChanged();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Metas diárias</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
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
            <Label className="text-xs">Vendedor</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda a equipe</SelectItem>
                {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
              </SelectContent>
            </Select>
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
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Meta/dia</TableHead>
              <TableHead>Período</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{metrics.find((m) => m.id === g.metric_id)?.label ?? "—"}</TableCell>
                <TableCell>{g.user_id ? (profiles.find((p) => p.user_id === g.user_id)?.full_name || "—") : "Equipe"}</TableCell>
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
