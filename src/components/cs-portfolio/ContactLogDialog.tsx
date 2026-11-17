import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTACT_CHANNELS, CONTACT_OUTCOMES, todaySP, type CsPortfolioRow } from "@/lib/csPortfolio";
import { useCsPortfolioMutations } from "@/hooks/useCsPortfolio";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useCsTaskMutations } from "@/hooks/useCsTasks";
import { useAuth } from "@/hooks/useAuth";
import { TASK_TYPES } from "@/lib/csTasks";

function defaultFollowUp() {
  const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ContactLogDialog({
  row,
  open,
  onOpenChange,
}: {
  row: CsPortfolioRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { logContact } = useCsPortfolioMutations();
  const [channel, setChannel] = useState("whatsapp");
  const [outcome, setOutcome] = useState("respondeu");
  const [date, setDate] = useState(todaySP());
  const [note, setNote] = useState("");
  const { user } = useAuth();
  const { save: saveTask } = useCsTaskMutations();
  const [withTask, setWithTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("follow_up");
  const [taskDue, setTaskDue] = useState(defaultFollowUp());

  async function save() {
    if (!row) return;
    if (withTask && (!taskTitle.trim() || !taskDue)) { toast.error("Informe título e data da próxima tarefa"); return; }
    try {
      await logContact.mutateAsync({
        portfolio_id: row.id,
        email: row.email,
        channel,
        outcome,
        note: note.trim() || undefined,
        contacted_at: new Date(`${date}T12:00:00-03:00`).toISOString(),
      });
      if (withTask) {
        try {
          await saveTask.mutateAsync({
            client_email: row.email, client_name: row.company_name || null, portfolio_id: row.id,
            title: taskTitle.trim(), description: note.trim() || null, task_type: taskType, priority: "media",
            status: "pendente", assigned_to: user?.id, due_at: new Date(taskDue).toISOString(),
          });
        } catch (e: any) {
          toast.error(`Atendimento registrado, mas a tarefa falhou: ${e.message || "erro"}`);
          onOpenChange(false); return;
        }
      }
      toast.success(withTask ? "Atendimento registrado e próxima tarefa agendada" : "Atendimento registrado");
      setNote(""); setWithTask(false); setTaskTitle(""); setTaskDue(defaultFollowUp());
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao registrar atendimento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar atendimento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 truncate">{row?.company_name || row?.email}</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Data do contato</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_CHANNELS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Resultado</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_OUTCOMES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resumo do contato, próximos passos..." />
          </div>
          <div className="rounded-md border p-3 space-y-3 bg-muted/30">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox checked={withTask} onCheckedChange={(v) => setWithTask(!!v)} />
              Agendar próxima tarefa para este cliente
            </label>
            {withTask && (
              <div className="space-y-3">
                <Input placeholder="Ex.: Retornar sobre proposta de BPO" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">A tarefa fica com você e as observações acima entram como descrição.</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={logContact.isPending || saveTask.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
