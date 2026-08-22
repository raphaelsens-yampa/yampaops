import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { groupBySection, parseNumberBR, type HistoryCampaign, type HistoryMetric, type HistoryValue } from "@/lib/campaignHistory";

interface RowState {
  target: string;
  actual: string;
  funnelTarget: string;
  funnelActual: string;
}

const toStr = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function CampaignValuesForm({
  open,
  onOpenChange,
  campaign,
  metrics,
  values,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: HistoryCampaign;
  metrics: HistoryMetric[];
  values: Map<string, HistoryValue>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);
  const draftKey = `campaign-history-draft:${campaign.id}`;
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      hydratedFor.current = null;
      return;
    }
    // Só hidrata uma vez por abertura, para não apagar o que o usuário digitou
    // quando as props (metrics/values) forem recriadas em novos renders.
    if (hydratedFor.current === campaign.id) return;
    hydratedFor.current = campaign.id;

    let draft: Record<string, RowState> = {};
    try {
      draft = JSON.parse(localStorage.getItem(draftKey) || "{}") || {};
    } catch { draft = {}; }

    const next: Record<string, RowState> = {};
    for (const m of metrics) {
      const v = values.get(`${campaign.id}|${m.id}`);
      next[m.id] = draft[m.id] ?? {
        target: toStr(v?.target_value),
        actual: toStr(v?.actual_value),
        funnelTarget: toStr(v?.funnel_target_pct),
        funnelActual: toStr(v?.funnel_actual_pct),
      };
    }
    setRows(next);
  }, [open, campaign.id, metrics, values, draftKey]);

  const set = (metricId: string, field: keyof RowState, value: string) =>
    setRows((prev) => {
      const next = { ...prev, [metricId]: { ...prev[metricId], [field]: value } };
      try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const save = async () => {
    setSaving(true);
    const payload = metrics.map((m) => {
      const r = rows[m.id] || { target: "", actual: "", funnelTarget: "", funnelActual: "" };
      return {
        campaign_id: campaign.id,
        metric_id: m.id,
        target_value: parseNumberBR(r.target),
        actual_value: parseNumberBR(r.actual),
        funnel_target_pct: m.is_funnel ? parseNumberBR(r.funnelTarget) : null,
        funnel_actual_pct: m.is_funnel ? parseNumberBR(r.funnelActual) : null,
      };
    });
    const { error } = await supabase
      .from("campaign_history_values")
      .upsert(payload, { onConflict: "campaign_id,metric_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Valores salvos" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar valores — {campaign.name}</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Indicador</TableHead>
              <TableHead>Meta</TableHead>
              <TableHead>Realizado</TableHead>
              <TableHead>% Meta Funil</TableHead>
              <TableHead>% Realizado Funil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupBySection(metrics).map((group) => (
              <>
                <TableRow key={`s-${group.section}`} className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={5} className="py-1 text-xs font-semibold uppercase">{group.section}</TableCell>
                </TableRow>
                {group.metrics.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell>
                      <Input className="h-9 w-28" inputMode="decimal" value={rows[m.id]?.target ?? ""} onChange={(e) => set(m.id, "target", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-9 w-28" inputMode="decimal" value={rows[m.id]?.actual ?? ""} onChange={(e) => set(m.id, "actual", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      {m.is_funnel && (
                        <Input className="h-9 w-24" inputMode="decimal" value={rows[m.id]?.funnelTarget ?? ""} onChange={(e) => set(m.id, "funnelTarget", e.target.value)} />
                      )}
                    </TableCell>
                    <TableCell>
                      {m.is_funnel && (
                        <Input className="h-9 w-24" inputMode="decimal" value={rows[m.id]?.funnelActual ?? ""} onChange={(e) => set(m.id, "funnelActual", e.target.value)} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar valores"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
