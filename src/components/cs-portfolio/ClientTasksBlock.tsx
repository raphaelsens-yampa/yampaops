import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useCsTasks } from "@/hooks/useCsTasks";
import { TaskList } from "./TaskList";
import { TaskDialog } from "./TaskDialog";
import type { CsPortfolioRow } from "@/lib/csPortfolio";

export function ClientTasksBlock({ row, userName }: { row: CsPortfolioRow; userName: (id: string) => string }) {
  const { data = [], isLoading } = useCsTasks(row.email);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tarefas</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Nova tarefa</Button>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando...</p> : <TaskList tasks={data} showClient={false} userName={userName} />}
      <TaskDialog open={open} onOpenChange={setOpen} client={row} />
    </div>
  );
}
