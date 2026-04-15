import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { STAGE_LABELS } from "@/lib/constants";

interface StagnantLead {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  consultant_name: string | null;
  days_stuck: number;
}

interface Props {
  leads: StagnantLead[];
}

export function BottleneckAlerts({ leads }: Props) {
  if (leads.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Gargalos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum lead estagnado há mais de 48h. 🎉</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" /> Gargalos ({leads.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-64 overflow-y-auto">
        {leads.map(l => (
          <div key={l.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
            <div>
              <span className="font-medium">{l.name}</span>
              {l.company && <span className="text-muted-foreground"> · {l.company}</span>}
              <span className="text-xs text-muted-foreground block">{STAGE_LABELS[l.stage]} · {l.consultant_name || "Sem consultor"}</span>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${l.days_stuck > 5 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
              {l.days_stuck}d
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
