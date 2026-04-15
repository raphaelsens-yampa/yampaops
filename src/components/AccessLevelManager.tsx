import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";

export const CRM_AREAS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "pipeline", label: "Pipeline" },
  { key: "forecast", label: "Forecast" },
  { key: "goals", label: "Metas" },
  { key: "team", label: "Equipe" },
  { key: "import", label: "Importação" },
  { key: "users", label: "Usuários" },
] as const;

export type CrmAreaKey = typeof CRM_AREAS[number]["key"];
export type AreaPermission = { view: boolean; create: boolean; edit: boolean };
export type Permissions = Record<CrmAreaKey, AreaPermission>;

export interface AccessLevel {
  id: string;
  name: string;
  description: string | null;
  permissions: Permissions;
  is_system: boolean;
  created_at: string;
}

const DEFAULT_PERMISSIONS: Permissions = CRM_AREAS.reduce((acc, area) => {
  acc[area.key] = { view: false, create: false, edit: false };
  return acc;
}, {} as Permissions);

interface Props {
  levels: AccessLevel[];
  onUpdate: () => void;
}

export function AccessLevelManager({ levels, onUpdate }: Props) {
  const { toast } = useToast();
  const [editLevel, setEditLevel] = useState<AccessLevel | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);

  function openCreate() {
    setIsNew(true);
    setName("");
    setDescription("");
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setEditLevel({} as AccessLevel);
  }

  function openEdit(level: AccessLevel) {
    setIsNew(false);
    setName(level.name);
    setDescription(level.description || "");
    // Merge with defaults in case some areas are missing
    const merged = { ...DEFAULT_PERMISSIONS };
    Object.entries(level.permissions).forEach(([k, v]) => {
      if (merged[k as CrmAreaKey]) merged[k as CrmAreaKey] = v as AreaPermission;
    });
    setPermissions(merged);
    setEditLevel(level);
  }

  function togglePermission(area: CrmAreaKey, perm: keyof AreaPermission) {
    setPermissions((prev) => ({
      ...prev,
      [area]: { ...prev[area], [perm]: !prev[area][perm] },
    }));
  }

  function toggleAllForArea(area: CrmAreaKey, checked: boolean) {
    setPermissions((prev) => ({
      ...prev,
      [area]: { view: checked, create: checked, edit: checked },
    }));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    if (isNew) {
      const { error } = await supabase.from("access_levels").insert({
        name: name.trim(),
        description: description.trim() || null,
        permissions: permissions as any,
      });
      if (error) {
        toast({ title: "Erro ao criar nível", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Nível de acesso criado" });
      }
    } else if (editLevel?.id) {
      const { error } = await supabase
        .from("access_levels")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          permissions: permissions as any,
        })
        .eq("id", editLevel.id);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Nível atualizado" });
      }
    }

    setSaving(false);
    setEditLevel(null);
    onUpdate();
  }

  async function handleDelete(level: AccessLevel) {
    if (level.is_system) {
      toast({ title: "Nível do sistema", description: "Não é possível excluir níveis padrão do sistema.", variant: "destructive" });
      return;
    }

    const { count } = await supabase
      .from("user_access_levels")
      .select("id", { count: "exact", head: true })
      .eq("access_level_id", level.id);

    if (count && count > 0) {
      toast({ title: "Nível em uso", description: `${count} usuário(s) estão atribuídos a este nível. Remova-os antes de excluir.`, variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("access_levels").delete().eq("id", level.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Nível excluído" });
      onUpdate();
    }
  }

  const permCount = (perms: Permissions) => {
    let total = 0;
    Object.values(perms).forEach((p) => {
      if (p.view) total++;
      if (p.create) total++;
      if (p.edit) total++;
    });
    return total;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-lg">Níveis de Acesso</h3>
          <p className="text-sm text-muted-foreground">Crie e gerencie perfis de permissões</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Nível
        </Button>
      </div>

      <div className="grid gap-3">
        {levels.map((level) => {
          const perms = level.permissions as Permissions;
          return (
            <Card key={level.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{level.name}</h4>
                        {level.is_system && <Badge variant="outline" className="text-xs">Sistema</Badge>}
                      </div>
                      {level.description && (
                        <p className="text-sm text-muted-foreground">{level.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {CRM_AREAS.map((area) => {
                          const p = perms[area.key];
                          if (!p?.view && !p?.create && !p?.edit) return null;
                          return (
                            <Badge key={area.key} variant="secondary" className="text-xs">
                              {area.label}
                              <span className="ml-1 opacity-60">
                                {[p.view && "V", p.create && "C", p.edit && "E"].filter(Boolean).join("")}
                              </span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(level)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!level.is_system && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(level)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={!!editLevel} onOpenChange={(open) => !open && setEditLevel(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo Nível de Acesso" : "Editar Nível de Acesso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Gerente" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva as responsabilidades deste nível" rows={2} />
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-medium">Permissões por Área</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Área</TableHead>
                      <TableHead className="text-center w-20">Visualizar</TableHead>
                      <TableHead className="text-center w-20">Criar</TableHead>
                      <TableHead className="text-center w-20">Editar</TableHead>
                      <TableHead className="text-center w-16">Todos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CRM_AREAS.map((area) => {
                      const p = permissions[area.key];
                      const allChecked = p.view && p.create && p.edit;
                      return (
                        <TableRow key={area.key}>
                          <TableCell className="font-medium text-sm">{area.label}</TableCell>
                          <TableCell className="text-center">
                            <Checkbox checked={p.view} onCheckedChange={() => togglePermission(area.key, "view")} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox checked={p.create} onCheckedChange={() => togglePermission(area.key, "create")} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox checked={p.edit} onCheckedChange={() => togglePermission(area.key, "edit")} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAllForArea(area.key, !!c)} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLevel(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : isNew ? "Criar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
