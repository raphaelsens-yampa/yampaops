import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_SECTIONS,
  DIRECTION_OPTIONS,
  UNIT_OPTIONS,
  slugify,
  type HistoryMetric,
} from "@/lib/campaignHistory";

function Row({ metric, onChange, onDelete }: { metric: HistoryMetric; onChange: (patch: Partial<HistoryMetric>) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: metric.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex flex-wrap items-center gap-2 rounded-md border p-2"
    >
      <button className="cursor-grab text-muted-foreground" {...attributes} {...listeners} aria-label="Reordenar">
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        className="h-9 w-full sm:w-56"
        value={metric.label}
        onChange={(e) => onChange({ label: e.target.value })}
        aria-label="Nome do indicador"
      />
      <Select value={metric.unit} onValueChange={(v) => onChange({ unit: v })}>
        <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {UNIT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={metric.direction} onValueChange={(v) => onChange({ direction: v })}>
        <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DIRECTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        className="h-9 w-full sm:w-48"
        value={metric.section ?? ""}
        placeholder="Seção"
        onChange={(e) => onChange({ section: e.target.value })}
        aria-label="Seção"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={metric.is_funnel} onCheckedChange={(v) => onChange({ is_funnel: v })} />
        Funil
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={metric.is_active} onCheckedChange={(v) => onChange({ is_active: v })} />
        Ativo
      </label>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Remover indicador">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function MetricsConfig({ metrics, onRefresh }: { metrics: HistoryMetric[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<HistoryMetric[]>(metrics);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ label: "", unit: "currency", direction: "higher", section: DEFAULT_SECTIONS[0], is_funnel: false });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Sincroniza quando a lista externa muda e não há edição pendente
  if (!dirty && list.map((m) => m.id).join() !== metrics.map((m) => m.id).join()) setList(metrics);

  const patch = (id: string, p: Partial<HistoryMetric>) => {
    setList((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));
    setDirty(true);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setList((prev) => {
      const from = prev.findIndex((m) => m.id === active.id);
      const to = prev.findIndex((m) => m.id === over.id);
      return arrayMove(prev, from, to);
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const updates = list.map((m, idx) =>
      supabase
        .from("campaign_history_metrics")
        .update({
          label: m.label,
          unit: m.unit,
          direction: m.direction,
          section: m.section || null,
          is_funnel: m.is_funnel,
          is_active: m.is_active,
          position: (idx + 1) * 10,
        })
        .eq("id", m.id),
    );
    const results = await Promise.all(updates);
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast({ title: "Erro ao salvar indicadores", description: failed.error.message, variant: "destructive" });
      return;
    }
    setDirty(false);
    toast({ title: "Indicadores atualizados" });
    onRefresh();
  };

  const add = async () => {
    if (!form.label.trim()) {
      toast({ title: "Informe o nome do indicador", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("campaign_history_metrics").insert({
      slug: slugify(form.label),
      label: form.label.trim(),
      unit: form.unit,
      direction: form.direction,
      section: form.section || null,
      is_funnel: form.is_funnel,
      position: (list.length + 1) * 10,
    });
    if (error) {
      toast({ title: "Erro ao criar indicador", description: error.message, variant: "destructive" });
      return;
    }
    setAddOpen(false);
    setForm({ label: "", unit: "currency", direction: "higher", section: DEFAULT_SECTIONS[0], is_funnel: false });
    setDirty(false);
    onRefresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("campaign_history_metrics").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    setDirty(false);
    onRefresh();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Configurações de indicadores</CardTitle>
          <p className="text-xs text-muted-foreground">Arraste para reordenar, edite nomes, formatos, seções e o bloco de funil.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Novo indicador
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {list.map((m) => (
              <Row key={m.id} metric={m} onChange={(p) => patch(m.id, p)} onDelete={() => remove(m.id)} />
            ))}
          </SortableContext>
        </DndContext>
        {!list.length && <p className="text-sm text-muted-foreground">Nenhum indicador cadastrado.</p>}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo indicador</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Formato</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Direção</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Seção</Label>
              <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_funnel} onCheckedChange={(v) => setForm({ ...form, is_funnel: v })} />
              Faz parte do bloco de funil (% Meta / % Realizado Funil)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={add}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
