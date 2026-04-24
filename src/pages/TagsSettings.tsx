import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Tag as TagIcon } from "lucide-react";
import { TagChip } from "@/components/tags/TagChip";
import type { Tag } from "@/hooks/useTags";
import { useToast } from "@/hooks/use-toast";

const PRESET_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#f59e0b", "#06b6d4", "#ec4899", "#94a3b8"];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function TagsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("is_system", { ascending: false }).order("name");
      if (error) throw error;
      return (data || []) as Tag[];
    },
  });

  function openNew() {
    setEditing(null);
    setName(""); setColor(PRESET_COLORS[0]); setDescription("");
    setOpen(true);
  }

  function openEdit(t: Tag) {
    setEditing(t);
    setName(t.name); setColor(t.color); setDescription(t.description || "");
    setOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from("tags")
        .update({ name: name.trim(), color, description: description || null })
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tag atualizada" });
    } else {
      const { error } = await supabase.from("tags").insert({
        name: name.trim(),
        slug: slugify(name),
        color,
        description: description || null,
      });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tag criada" });
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["tags"] });
  }

  async function handleDelete(t: Tag) {
    if (t.is_system) {
      toast({ title: "Não permitido", description: "Tags de sistema não podem ser excluídas.", variant: "destructive" });
      return;
    }
    if (!confirm(`Excluir a tag "${t.name}"? Ela será removida de todas as oportunidades.`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", t.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Tag excluída" });
    qc.invalidateQueries({ queryKey: ["tags"] });
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <TagIcon className="h-6 w-6" /> Tags
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie as tags aplicáveis às oportunidades. Tags de sistema são criadas automaticamente pela integração com o Chatwoot.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova tag</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar tag" : "Nova tag"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Quente, Pendente, Re-engajar..." />
                </div>
                <div>
                  <Label>Cor</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                    <Input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-12 h-8 p-0.5 cursor-pointer"
                    />
                  </div>
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando usar esta tag..." />
                </div>
                {name && (
                  <div className="rounded-md border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-2">Pré-visualização:</p>
                    <TagChip tag={{ id: "preview", name, slug: slugify(name), color, is_system: false, description: null }} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSave}>{editing ? "Salvar" : "Criar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Todas as tags ({tags.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</p>
            ) : (
              <div className="divide-y">
                {tags.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <TagChip tag={t} />
                      {t.is_system && (
                        <Badge variant="secondary" className="text-[10px] uppercase">Sistema</Badge>
                      )}
                      {t.description && (
                        <span className="text-xs text-muted-foreground truncate">{t.description}</span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(t)}
                      disabled={t.is_system}
                      title={t.is_system ? "Tag de sistema não pode ser excluída" : "Excluir"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
