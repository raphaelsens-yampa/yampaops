import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, X, StopCircle } from "lucide-react";
import { useCohortSync } from "@/contexts/CohortSyncContext";

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export function GlobalCohortSyncBanner() {
  const { syncing, phase, phaseLabel, percent, elapsedSec, etaSec, campaignId, campaignName, error, cancel, dismiss } = useCohortSync();

  if (phase === "idle") return null;

  const isError = phase === "error";
  const isCancelled = phase === "cancelled";
  const isDone = phase === "done";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]">
      <Card className={isError ? "border-destructive shadow-lg" : "shadow-lg"}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className={`h-4 w-4 shrink-0 ${syncing ? "animate-spin text-primary" : isError ? "text-destructive" : "text-muted-foreground"}`} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {isDone ? "Sincronização concluída" : isError ? "Falha na sincronização" : isCancelled ? "Sincronização cancelada" : "Sincronizando Chatwoot + Cohort"}
                </div>
                {campaignId && (
                  <Link to={`/sales-campaigns/${campaignId}`} className="text-[11px] text-muted-foreground hover:underline truncate block">
                    {campaignName || "Ver campanha"}
                  </Link>
                )}
              </div>
            </div>
            {!syncing && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={dismiss}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground">
            {phaseLabel}
          </div>
          <Progress value={percent} />
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
            <span>{percent.toFixed(0)}% • {formatDuration(elapsedSec)}</span>
            {syncing && etaSec !== null && <span>restam ~{formatDuration(etaSec)}</span>}
          </div>
          {isError && error && <div className="text-[11px] text-destructive break-words">{error}</div>}
          {syncing && (
            <Button variant="destructive" size="sm" className="w-full h-7" onClick={cancel}>
              <StopCircle className="h-3.5 w-3.5 mr-1" />Parar atualização
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
