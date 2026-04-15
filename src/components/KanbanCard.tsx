import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";
import { ACTIVITY_LABELS } from "@/lib/constants";
import type { Database } from "@/integrations/supabase/types";

type Opportunity = Database["public"]["Tables"]["opportunities"]["Row"];

interface KanbanCardProps {
  lead: Opportunity;
  activityOpen: string | null;
  setActivityOpen: (id: string | null) => void;
  activityType: string;
  setActivityType: (t: string) => void;
  activityNotes: string;
  setActivityNotes: (n: string) => void;
  onLogActivity: (leadId: string) => void;
}

export function KanbanCard({
  lead, activityOpen, setActivityOpen,
  activityType, setActivityType,
  activityNotes, setActivityNotes, onLogActivity,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { stage: lead.stage },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const daysSince = Math.floor(
    (Date.now() - new Date(lead.last_interaction_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
        <CardContent className="p-3 space-y-2">
          <div>
            <p className="font-medium text-sm">{lead.title || lead.name}</p>
            {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-primary font-medium">R$ {(lead.estimated_mrr || 0).toLocaleString("pt-BR")}</span>
            <span className={daysSince >= 2 ? "text-destructive" : "text-muted-foreground"}>{daysSince}d</span>
          </div>
          <Dialog open={activityOpen === lead.id} onOpenChange={(open) => setActivityOpen(open ? lead.id : null)}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                <MessageSquare className="h-3 w-3 mr-1" /> Registrar Atividade
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Atividade</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={activityType} onValueChange={setActivityType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea placeholder="Notas..." value={activityNotes} onChange={e => setActivityNotes(e.target.value)} />
                <Button onClick={() => onLogActivity(lead.id)} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
