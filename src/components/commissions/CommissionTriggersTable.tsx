import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Zap } from "lucide-react";

interface Trigger {
  id: string;
  name: string;
  extra_percent: number;
  goal_id: string | null;
  goal_type: string;
  is_active: boolean;
}

interface Goal {
  id: string;
  scope: string | null;
  period_start: string;
  period_end: string;
  target_mrr: number | null;
}

export function CommissionTriggersTable() {
  const { toast } = useToast();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Trigger | null>(null);

  const [form, setForm] = useState({
    name: "", extra_percent: "20", goal_id: "", goal_type: "company", is_active: false,
  });

  const fetchData = async () => {
    const [{ data: trigData }, { data: goalData }] = await Promise.all([
      supabase.from("commission_triggers").select("*").order("created_at"),
      supabase.from("goals").select("id, scope, period_start, period_end, target_mrr").order("period_start", { ascending: false }).limit(50),
    ]);
    setTriggers((trigData as Trigger[]) || []);
    setGoals((goalData as Goal[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", extra_percent: "20", goal_id: "", goal_type: "company", is_active: false });
    setDialogOpen(true);
  };

  const openEdit = (t: Trigger) => {
    setEditing(t);
    setForm({
      name: t.name,
      extra_percent: t.extra_percent.toString(),
      goal_id: t.goal_id || "",
      goal_type: t.goal_type,
      is_active: t.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      name: form.name,
      extra_percent: Number(form.extra_percent) || 0,
      goal_id: form.goal_id || null,
      goal_type: form.goal_type,
      is_active: form.is_active,
    };

    const { error } = editing
      ? await supabase.from("commission_triggers").update(payload).eq("id", editing.id)
      : await supabase.from("commission_triggers").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Gatilho atualizado" : "Gatilho criado" });
      setDialogOpen(false);
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este gatilho?")) return;
    const { error } = await supabase.from("commission_triggers").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Gatilho excluído" });
      fetchData();
    }
  };

  const toggleActive = async (t: Trigger) => {
    const { error } = await supabase.from("commission_triggers").update({ is_active: !t.is_active }).eq("id", t.id);
    if (!error) fetchData();
  };

  const getGoalLabel = (id: string | null) => {
    if (!id) return "Nenhuma";
    const g = goals.find((g) => g.id === id);
    if (!g) return id;
    return `${g.scope || "Empresa"} — ${new Date(g.period_start).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4" /> Gatilhos de Comissão Extra
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Gatilho</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Gatilho" : "Novo Gatilho"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Bônus 120% meta empresa" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Percentual Extra (%)</Label>
                  <Input type="number" step="1" value={form.extra_percent} onChange={(e) => setForm({ ...form, extra_percent: e.target.value })} />
                </div>
                <div>
                  <Label>Tipo de Meta</Label>
                  <Select value={form.goal_type} onValueChange={(v) => setForm({ ...form, goal_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Empresa</SelectItem>
                      <SelectItem value="team">Equipe</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Meta Associada (opcional)</Label>
                <Select value={form.goal_id} onValueChange={(v) => setForm({ ...form, goal_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar meta" /></SelectTrigger>
                  <SelectContent>
                    {goals.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.scope || "Empresa"} — {new Date(g.period_start).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} (MRR: R${g.target_mrr || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Ativo</Label>
                  <p className="text-xs text-muted-foreground">Ativar este gatilho de bônus</p>
                </div>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">% Extra</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Meta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {triggers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-right">{t.extra_percent}%</TableCell>
                  <TableCell className="capitalize">{t.goal_type}</TableCell>
                  <TableCell>{getGoalLabel(t.goal_id)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={t.is_active ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => toggleActive(t)}
                    >
                      {t.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {triggers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum gatilho cadastrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
