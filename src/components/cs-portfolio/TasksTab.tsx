import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCsTasks } from "@/hooks/useCsTasks";
import { PRIORITY_LABEL, STATUS_LABEL, filterTasks, taskCounters, type TaskFilters } from "@/lib/csTasks";
import { TaskList } from "./TaskList";
import { TaskDialog } from "./TaskDialog";
import type { CsPortfolioRow } from "@/lib/csPortfolio";

export function TasksTab({ clients, userName }: { clients: CsPortfolioRow[]; userName: (id: string) => string }) {
  const { user } = useAuth();
  const { data: tasks = [], isLoading } = useCsTasks();
  const [f, setF] = useState<TaskFilters>({ mine: true, status: "abertas", period: "todas", priority: "todas", search: "" });
  const [creating, setCreating] = useState(false);
  const scoped = useMemo(() => (f.mine ? tasks.filter((t) => t.assigned_to === user?.id) : tasks), [tasks, f.mine, user?.id]);
  const c = taskCounters(scoped);
  const list = useMemo(() => filterTasks(tasks, f, user?.id), [tasks, f, user?.id]);
  const set = (k: keyof TaskFilters, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[["Atrasadas", c.atrasadas, "atrasadas"], ["Hoje", c.hoje, "hoje"], ["Próximos 7 dias", c.semana, "semana"], ["Concluídas no mês", c.concluidasMes, null]].map(([l, v, p]) => (
          <Card key={l as string} className={p ? "cursor-pointer hover:bg-muted/40" : ""} onClick={() => p && setF((x) => ({ ...x, period: p as any, status: "abertas" }))}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{l}</p>
              <p className={`text-2xl font-semibold mt-1 ${p === "atrasadas" && (v as number) > 0 ? "text-destructive" : ""}`}>{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <F v={f.mine ? "mine" : "all"} on={(v) => set("mine", v === "mine")} items={[["mine", "Minhas"], ["all", "Todas da equipe"]]} />
        <F v={f.status} on={(v) => set("status", v)} items={[["abertas", "Em aberto"], ["todas", "Todos os status"], ...Object.entries(STATUS_LABEL)]} />
        <F v={f.period} on={(v) => set("period", v)} items={[["todas", "Qualquer data"], ["atrasadas", "Atrasadas"], ["hoje", "Hoje"], ["semana", "Próximos 7 dias"]]} />
        <F v={f.priority} on={(v) => set("priority", v)} items={[["todas", "Toda prioridade"], ...Object.entries(PRIORITY_LABEL)]} />
        <Input className="h-9 w-56" placeholder="Buscar cliente ou título" value={f.search} onChange={(e) => set("search", e.target.value)} />
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Nova tarefa</Button>
      </div>
      <Card><CardContent className="p-3 sm:p-4">
        {isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Carregando tarefas...</p> : <TaskList tasks={list} userName={userName} clients={clients} />}
      </CardContent></Card>
      <TaskDialog open={creating} onOpenChange={setCreating} clients={clients} />
    </div>
  );
}

function F({ v, on, items }: { v: string; on: (v: string) => void; items: string[][] }) {
  return (
    <Select value={v} onValueChange={on}>
      <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}
