import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { PipelineStage } from "@/hooks/usePipelineStages";

interface Props {
  stages: PipelineStage[];
  onUpdate: () => void;
}

export function StageManager({ stages, onUpdate }: Props) {
  const { toast } = useToast();
  const [editStage, setEditStage] = useState<PipelineStage | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setIsNew(true);
    setName("");
    setSlug("");
    setColor("#94a3b8");
    setIsWon(false);
    setIsLost(false);
    setEditStage({} as PipelineStage);
  }

  function openEdit(s: PipelineStage) {
    setIsNew(false);
    setName(s.name);
    setSlug(s.slug);
    setColor(s.color || "#94a3b8");
    setIsWon(s.is_won);
    setIsLost(s.is_lost);
    setEditStage(s);
  }

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const finalSlug = slug.trim() || generateSlug(name);

    if (isNew) {
      const maxPos = stages.length > 0 ? Math.max(...stages.map((s) => s.position)) + 1 : 0;
      const { error } = await supabase.from("pipeline_stages").insert({
        name: name.trim(),
        slug: finalSlug,
        position: maxPos,
        color,
        is_won: isWon,
        is_lost: isLost,
      });
      if (error) {
        toast({ title: "Erro ao criar etapa", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Etapa criada" });
      }
    } else if (editStage?.id) {
      const { error } = await supabase
        .from("pipeline_stages")
        .update({ name: name.trim(), slug: finalSlug, color, is_won: isWon, is_lost: isLost })
        .eq("id", editStage.id);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Etapa atualizada" });
      }
    }

    setSaving(false);
    setEditStage(null);
    onUpdate();
  }

  async function handleDelete(s: PipelineStage) {
    // Check if any leads use this stage
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", s.slug);

    if (count && count > 0) {
      toast({
        title: "Não é possível excluir",
        description: `Existem ${count} leads nesta etapa. Mova-os antes de excluir.`,
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("pipeline_stages").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Etapa excluída" });
      onUpdate();
    }
  }

  async function moveStage(s: PipelineStage, direction: "up" | "down") {
    const idx = stages.findIndex((st) => st.id === s.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= stages.length) return;

    const other = stages[swapIdx];
    await Promise.all([
      supabase.from("pipeline_stages").update({ position: other.position }).eq("id", s.id),
      supabase.from("pipeline_stages").update({ position: s.position }).eq("id", other.id),
    ]);
    onUpdate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg">Etapas do Pipeline</h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nova Etapa
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Ordem</TableHead>
            <TableHead>Cor</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.map((s, idx) => (
            <TableRow key={s.id}>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={idx === 0}
                    onClick={() => moveStage(s, "up")}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={idx === stages.length - 1}
                    onClick={() => moveStage(s, "down")}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <div className="w-5 h-5 rounded" style={{ backgroundColor: s.color || "#94a3b8" }} />
              </TableCell>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground text-xs font-mono">{s.slug}</TableCell>
              <TableCell>
                {s.is_won && <Badge className="bg-green-600">Won</Badge>}
                {s.is_lost && <Badge variant="destructive">Perdido</Badge>}
                {!s.is_won && !s.is_lost && <Badge variant="secondary">Ativo</Badge>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={!!editStage} onOpenChange={(open) => !open && setEditStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? "Nova Etapa" : "Editar Etapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (isNew) setSlug(generateSlug(e.target.value));
                }}
                placeholder="Ex: Qualificação"
              />
            </div>
            <div className="space-y-1">
              <Label>Slug (identificador)</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Ex: qualificacao"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-8 rounded border cursor-pointer"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-28 font-mono text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={isWon} onCheckedChange={(v) => { setIsWon(v); if (v) setIsLost(false); }} />
                <Label>Etapa de Ganho (Won)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isLost} onCheckedChange={(v) => { setIsLost(v); if (v) setIsWon(false); }} />
                <Label>Etapa de Perda</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStage(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : isNew ? "Criar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
