import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCsTaskMutations } from "@/hooks/useCsTasks";
import { PRIORITY_LABEL, STATUS_LABEL, TASK_TYPES, isOpen, taskBucket, type CsTask } from "@/lib/csTasks";
import { TaskDialog } from "./TaskDialog";
import type { CsPortfolioRow } from "@/lib/csPortfolio";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function TaskList({ tasks, showClient = true, userName, clients }: {
  tasks: CsTask[]; showClient?: boolean; userName: (id: string) => string; clients?: CsPortfolioRow[];
}) {
  const { user, role } = useAuth();
  const { save, remove } = useCsTaskMutations();
  const [edit, setEdit] = useState<CsTask | null>(null);
  const canEdit = (t: CsTask) => role === "admin" || t.created_by === user?.id || t.assigned_to === user?.id;
  if (!tasks.length) return <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma tarefa.</p>;
  return (
    <>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const late = taskBucket(t) === "atrasada";
          return (
            <li key={t.id} className={`rounded-md border p-3 text-sm ${late ? "border-destructive bg-destructive/5" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`font-medium ${t.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                  {showClient && <p className="text-xs text-muted-foreground break-all">{t.client_name ? `${t.client_name} · ` : ""}{t.client_email}</p>}
                  <p className={`text-xs ${late ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {late ? "Atrasada · " : ""}{fmt(t.due_at)} · {TASK_TYPES.find((x) => x.key === t.task_type)?.label || t.task_type} · {userName(t.assigned_to)}
                  </p>
                  {t.description && <p className="text-xs mt-1 whitespace-pre-wrap">{t.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={t.priority === "alta" ? "destructive" : "outline"}>{PRIORITY_LABEL[t.priority]}</Badge>
                  <Badge variant="secondary">{STATUS_LABEL[t.status]}</Badge>
                  {canEdit(t) && (
                    <>
                      {isOpen(t) && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Concluir"
                          onClick={() => save.mutateAsync({ id: t.id, status: "concluida" }).then(() => toast.success("Tarefa concluída"), (e) => toast.error(e.message))}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir"
                        onClick={() => confirm("Excluir esta tarefa?") && remove.mutateAsync(t.id).then(() => toast.success("Tarefa excluída"), (e) => toast.error(e.message))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <TaskDialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)} task={edit} clients={clients} />
    </>
  );
}
