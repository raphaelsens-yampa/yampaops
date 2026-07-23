import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Zap, Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS, formatMetric, isBetterBelow, progressPct, statusColorFor, type CategoryArea, type GoalCategory } from "@/lib/goalCategories";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CategoryRow {
  category: GoalCategory;
  target: number;
  realized: number;
  source?: "stripe" | "manual" | "calculated";
  manualOverride?: boolean;
  goalIds?: string[];
  autoValue?: number | null;
}

interface Props {
  rows: CategoryRow[];
  onChanged?: () => void;
}

function statusLabel(pct: number, direction?: string | null): { label: string; variant: "default" | "secondary" | "destructive" } {
  const lte = isBetterBelow(direction);
  if (lte) {
    // pct aqui é target/realized*100 (progressPct). >=100 = dentro do teto.
    if (pct >= 100) return { label: "Dentro do teto", variant: "default" };
    if (pct >= 80) return { label: "Alerta", variant: "secondary" };
    return { label: "Estourou", variant: "destructive" };
  }
  if (pct >= 100) return { label: "Atingido", variant: "default" };
  if (pct >= 70) return { label: "No ritmo", variant: "secondary" };
  return { label: "Atrasado", variant: "destructive" };
}

export function GoalsBreakdownByCategory({ rows, onChanged }: Props) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit(row: CategoryRow) {
    setEditing(row);
    setOverrideValue(row.manualOverride ? String(row.realized) : "");
    setNote("");
  }

  async function saveOverride(clear = false) {
    if (!editing || !editing.goalIds?.length) return;
    setSaving(true);
    const val = clear ? null : Number(overrideValue.replace(",", "."));
    if (!clear && (isNaN(val as number) || (val as number) < 0)) {
      toast.error("Valor inválido");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("goals")
      .update({
        realized_override: clear ? null : val,
        realized_source_note: clear ? null : (note || null),
      })
      .in("id", editing.goalIds);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(clear ? "Override removido" : "Realizado manual salvo");
    setEditing(null);
    onChanged?.();
  }

  const byArea: Record<CategoryArea, CategoryRow[]> = { sales: [], cs: [], campaign: [], financial: [] };
  rows.forEach(r => byArea[r.category.area].push(r));

  const areas: CategoryArea[] = ["sales", "cs", "campaign", "financial"];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Acompanhamento por Categoria</h3>
      {areas.map(area => {
        const areaRows = byArea[area];
        if (!areaRows.length) return null;
        return (
          <div key={area} className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{AREA_LABELS[area]}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {areaRows.map((row) => {
                const { category, target, realized, source, manualOverride, autoValue, goalIds } = row;
                const lte = isBetterBelow(category.goal_direction);
                const pct = progressPct(realized, target, category.goal_direction);
                const barPct = lte
                  ? Math.min(100, target > 0 ? (realized / target) * 100 : 0)
                  : Math.min(100, pct);
                const status = statusLabel(pct, category.goal_direction);
                const canEdit = isAdmin && source && source !== "calculated" && (goalIds?.length || 0) > 0;
                return (
                  <Card key={category.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between gap-2">
                        <span className="truncate">{category.name}</span>
                        <Badge variant={status.variant} className="text-[10px] shrink-0">{status.label}</Badge>
                      </CardTitle>
                      {source === "stripe" && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Zap className="h-3 w-3 text-primary" />
                          <span>{lte ? "Churn calculado via Stripe" : "Atualizado automaticamente pela Stripe"}</span>
                        </div>
                      )}
                      {source === "manual" && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                          <Pencil className="h-3 w-3" />
                          <span>Valor manual (override) — auto: {formatMetric(autoValue || 0, category.metric_type)}</span>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold">{formatMetric(realized, category.metric_type)}</span>
                        <span className="text-xs text-muted-foreground">/ {lte ? "teto " : ""}{formatMetric(target, category.metric_type)}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className={cn("h-full transition-all", statusColorFor(realized, target, category.goal_direction))} style={{ width: `${barPct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground text-right">
                          {lte
                            ? (realized <= target
                                ? `${formatMetric(Math.max(0, target - realized), category.metric_type)} de folga`
                                : `Excedeu em ${formatMetric(realized - target, category.metric_type)}`)
                            : `${pct.toFixed(0)}% atingido`}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex justify-end pt-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(row)}>
                            <Pencil className="h-3 w-3 mr-1" />
                            {manualOverride ? "Editar override" : "Ajuste manual"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma categoria com meta cadastrada no período.</p>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste manual — {editing?.category.name}</DialogTitle>
            <DialogDescription>
              Sobrescreve o valor calculado automaticamente para todas as metas desta categoria no período visível.
              {editing?.autoValue != null && (
                <span className="block mt-1">
                  Valor automático atual: <strong>{formatMetric(editing.autoValue || 0, editing.category.metric_type)}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="override-val">Realizado manual</Label>
              <Input
                id="override-val"
                type="number"
                step="0.01"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label htmlFor="override-note">Observação (opcional)</Label>
              <Input
                id="override-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: ajuste contábil de junho"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editing?.manualOverride && (
              <Button variant="outline" onClick={() => saveOverride(true)} disabled={saving}>
                <RotateCcw className="h-3 w-3 mr-1" /> Voltar para automático
              </Button>
            )}
            <Button onClick={() => saveOverride(false)} disabled={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
