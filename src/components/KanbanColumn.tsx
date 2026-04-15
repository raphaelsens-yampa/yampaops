import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./KanbanCard";
import { STAGE_LABELS } from "@/lib/constants";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

interface KanbanColumnProps {
  stage: string;
  leads: Lead[];
  activityOpen: string | null;
  setActivityOpen: (id: string | null) => void;
  activityType: string;
  setActivityType: (t: string) => void;
  activityNotes: string;
  setActivityNotes: (n: string) => void;
  onLogActivity: (leadId: string) => void;
}

export function KanbanColumn({
  stage, leads,
  activityOpen, setActivityOpen,
  activityType, setActivityType,
  activityNotes, setActivityNotes, onLogActivity,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="min-w-[260px] flex-shrink-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-heading font-semibold">{STAGE_LABELS[stage]}</h3>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-2 rounded-lg p-2 min-h-[120px] transition-colors ${isOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/30"}`}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              activityOpen={activityOpen}
              setActivityOpen={setActivityOpen}
              activityType={activityType}
              setActivityType={setActivityType}
              activityNotes={activityNotes}
              setActivityNotes={setActivityNotes}
              onLogActivity={onLogActivity}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
