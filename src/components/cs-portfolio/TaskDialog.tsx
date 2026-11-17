import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCsAnalysts } from "@/hooks/useCsPortfolio";
import { useCsTaskMutations } from "@/hooks/useCsTasks";
import { PRIORITY_LABEL, STATUS_LABEL, TASK_TYPES, type CsTask } from "@/lib/csTasks";
import type { CsPortfolioRow } from "@/lib/csPortfolio";

function toLocalInput(iso: string) {
  const d = new Date(iso); const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function TaskDialog({ open, onOpenChange, task, client, clients = [] }: {
  open: boolean; onOpenChange: (v: boolean) => void; task?: CsTask | null;
  client?: CsPortfolioRow | null; clients?: CsPortfolioRow[];
}) {
  const { user } = useAuth();
  const { data: analysts = [] } = useCsAnalysts();
  const { save } = useCsTaskMutations();
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    const due = new Date(); due.setHours(due.getHours() + 1, 0, 0, 0);
    setF(task ? { ...task, due_local: toLocalInput(task.due_at) } : {
      client_email: client?.email || "", client_name: client?.company_name || null, portfolio_id: client?.id || null,
      title: "", description: "", task_type: "follow_up", priority: "media", status: "pendente",
      assigned_to: user?.id, due_local: toLocalInput(due.toISOString()),
    });
  }, [open, task, client, user?.id]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  async function submit() {
    if (!f.title?.trim() || !f.client_email?.trim() || !f.due_local) { toast.error("Preencha cliente, título e data"); return; }
    const match = clients.find((c) => c.email.toLowerCase() === f.client_email.trim().toLowerCase());
    const { due_local, ...rest } = f;
    try {
      await save.mutateAsync({
        id: task?.id, client_email: rest.client_email, client_name: rest.client_name ?? match?.company_name ?? null,
        portfolio_id: rest.portfolio_id ?? match?.id ?? null, title: rest.title.trim(), description: rest.description || null,
        task_type: rest.task_type, priority: rest.priority, status: rest.status, assigned_to: rest.assigned_to,
        due_at: new Date(due_local).toISOString(), completed_at: task?.completed_at ?? null,
      });
      toast.success(task ? "Tarefa atualizada" : "Tarefa criada");
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || "Falha ao salvar tarefa"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Cliente (e-mail)</Label>
            <Input list="cs-task-clients" value={f.client_email || ""} disabled={!!client || !!task} onChange={(e) => set("client_email", e.target.value)} />
            <datalist id="cs-task-clients">{clients.slice(0, 3000).map((c) => <option key={c.id} value={c.email}>{c.company_name || ""}</option>)}</datalist>
          </div>
          <div><Label>Título</Label><Input value={f.title || ""} onChange={(e) => set("title", e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea rows={3} value={f.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Sel label="Tipo" value={f.task_type} onChange={(v) => set("task_type", v)} items={TASK_TYPES.map((t) => [t.key, t.label])} />
            <Sel label="Prioridade" value={f.priority} onChange={(v) => set("priority", v)} items={Object.entries(PRIORITY_LABEL)} />
            <div><Label>Data e hora</Label><Input type="datetime-local" value={f.due_local || ""} onChange={(e) => set("due_local", e.target.value)} /></div>
            <Sel label="Status" value={f.status} onChange={(v) => set("status", v)} items={Object.entries(STATUS_LABEL)} />
          </div>
          <Sel label="Responsável" value={f.assigned_to} onChange={(v) => set("assigned_to", v)}
            items={analysts.map((a) => [a.user_id, a.full_name || a.email || "—"]).concat(analysts.some((a) => a.user_id === user?.id) || !user ? [] : [[user.id, "Eu"]])} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Sel({ label, value, onChange, items }: { label: string; value: string; onChange: (v: string) => void; items: (string | null)[][] }) {
  return (
    <div><Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{items.map(([k, l]) => <SelectItem key={k!} value={k!}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
