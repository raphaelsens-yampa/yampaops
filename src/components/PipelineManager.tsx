import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

interface PipelineManagerProps {
  pipelines: Pipeline[];
  currentPipelineId: string;
  onSelect: (id: string) => void;
  onUpdate: () => void;
}

export function PipelineManager({ pipelines, currentPipelineId, onSelect, onUpdate }: PipelineManagerProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function startCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
  }

  function startEdit(p: Pipeline) {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description || "");
  }

  async function save() {
    if (!name.trim()) return;
    if (editingId) {
      const { error } = await supabase.from("pipelines").update({ name, description: description || null }).eq("id", editingId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Pipeline atualizado" });
    } else {
      const { data, error } = await supabase.from("pipelines").insert({ name, description: description || null }).select().single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Pipeline criado" });
      if (data) onSelect(data.id);
    }
    setEditingId(null);
    setName("");
    setDescription("");
    onUpdate();
  }

  async function deletePipeline(id: string) {
    const p = pipelines.find(pp => pp.id === id);
    if (p?.is_default) { toast({ title: "Não é possível excluir o pipeline padrão", variant: "destructive" }); return; }
    const { error } = await supabase.from("pipelines").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pipeline excluído" });
    if (currentPipelineId === id) {
      const def = pipelines.find(pp => pp.is_default);
      if (def) onSelect(def.id);
    }
    onUpdate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutGrid className="h-4 w-4 mr-1" /> Pipelines
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Gerenciar Pipelines</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {pipelines.map(p => (
            <div key={p.id} className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors ${p.id === currentPipelineId ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => { onSelect(p.id); setOpen(false); }}>
              <div>
                <p className="text-sm font-medium">{p.name} {p.is_default && <span className="text-xs text-muted-foreground">(padrão)</span>}</p>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
              </div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                {!p.is_default && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePipeline(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>
          ))}

          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {editingId ? "Editar Pipeline" : "Novo Pipeline"}
            </p>
            <div><Label className="text-xs">Nome *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pipeline Enterprise" /></div>
            <div><Label className="text-xs">Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="h-16" /></div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!name.trim()} className="flex-1">
                {editingId ? "Salvar" : <><Plus className="h-4 w-4 mr-1" /> Criar</>}
              </Button>
              {editingId && <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setName(""); setDescription(""); }}>Cancelar</Button>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
