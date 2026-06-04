import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Shield, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Definição declarativa das seções e subseções (alinhadas ao sidebar)
export const CRM_SECTIONS = [
  {
    key: "overview",
    label: "Visão Geral",
    areas: [
      { key: "dashboard", label: "Dashboard" },
      { key: "forecast", label: "Forecast" },
      { key: "goals", label: "Metas" },
      { key: "conversions", label: "Conversões por Área" },
    ],
  },
  {
    key: "operations",
    label: "Operações",
    areas: [
      { key: "pipeline", label: "Pipeline" },
      { key: "atendimentos", label: "Atendimentos" },
      { key: "agent_activity", label: "Atividade de Agentes" },
      { key: "auditoria_ia", label: "Auditoria IA" },
      { key: "lead_journey", label: "Jornada do Lead" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    areas: [
      { key: "sales_campaigns", label: "Campanhas de Sales" },
      { key: "commissions", label: "Comissões" },
      { key: "link_builder", label: "Gerador de Ofertas" },
      { key: "precificacao", label: "Precificação Serviços" },
    ],
  },
  {
    key: "discounts",
    label: "Estratégia Adquirência",
    areas: [
      { key: "discounts_overview", label: "Visão Geral" },
      { key: "discounts_portfolio", label: "Minha Carteira" },
      { key: "discounts_rules", label: "Configurar Faixas" },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    areas: [
      { key: "contacts", label: "Contatos" },
      { key: "team", label: "Equipe" },
      { key: "users", label: "Usuários & Acessos" },
      { key: "import", label: "Importação" },
      { key: "tags", label: "Tags" },
    ],
  },
  {
    key: "integracoes",
    label: "Integrações",
    areas: [
      { key: "integration_ac", label: "ActiveCampaign" },
      { key: "integration_stripe", label: "Stripe" },
      { key: "integration_chatwoot", label: "Chatwoot" },
      { key: "integration_audit", label: "Auditoria de Integrações" },
    ],
  },
] as const;

export type SectionKey = typeof CRM_SECTIONS[number]["key"];
export type AreaKey = typeof CRM_SECTIONS[number]["areas"][number]["key"];
export type CrmAreaKey = SectionKey | AreaKey;

// Lista plana de todas as chaves (seções + áreas)
export const CRM_AREAS: { key: CrmAreaKey; label: string }[] = CRM_SECTIONS.flatMap((s) => [
  { key: s.key as CrmAreaKey, label: s.label },
  ...s.areas.map((a) => ({ key: a.key as CrmAreaKey, label: a.label })),
]);

export type AreaPermission = { view: boolean; create: boolean; edit: boolean };
export type Permissions = Partial<Record<CrmAreaKey, AreaPermission>>;

export interface AccessLevel {
  id: string;
  name: string;
  description: string | null;
  permissions: Permissions;
  is_system: boolean;
  created_at: string;
}

const ALL_KEYS: CrmAreaKey[] = CRM_AREAS.map((a) => a.key);

function buildDefaults(value = false): Permissions {
  const p: Permissions = {};
  for (const k of ALL_KEYS) p[k] = { view: value, create: value, edit: value };
  return p;
}

interface Props {
  levels: AccessLevel[];
  onUpdate: () => void;
}

export function AccessLevelManager({ levels, onUpdate }: Props) {
  const { toast } = useToast();
  const [editLevel, setEditLevel] = useState<AccessLevel | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(buildDefaults(false));

  function openCreate() {
    setIsNew(true);
    setName("");
    setDescription("");
    setPermissions(buildDefaults(false));
    setEditLevel({} as AccessLevel);
  }

  function openEdit(level: AccessLevel) {
    setIsNew(false);
    setName(level.name);
    setDescription(level.description || "");
    const merged = buildDefaults(false);
    Object.entries(level.permissions || {}).forEach(([k, v]) => {
      if (ALL_KEYS.includes(k as CrmAreaKey)) merged[k as CrmAreaKey] = v as AreaPermission;
    });
    setPermissions(merged);
    setEditLevel(level);
  }

  function setPerm(area: CrmAreaKey, patch: Partial<AreaPermission>) {
    setPermissions((prev) => ({
      ...prev,
      [area]: { ...(prev[area] || { view: false, create: false, edit: false }), ...patch },
    }));
  }

  function togglePermission(area: CrmAreaKey, perm: keyof AreaPermission) {
    const cur = permissions[area] || { view: false, create: false, edit: false };
    setPerm(area, { [perm]: !cur[perm] } as Partial<AreaPermission>);
  }

  function toggleAllForArea(area: CrmAreaKey, checked: boolean) {
    setPerm(area, { view: checked, create: checked, edit: checked });
  }

  function toggleSection(sectionKey: SectionKey, perm: keyof AreaPermission, checked: boolean) {
    const section = CRM_SECTIONS.find((s) => s.key === sectionKey)!;
    setPermissions((prev) => {
      const next = { ...prev };
      const apply = (k: CrmAreaKey) => {
        next[k] = { ...(next[k] || { view: false, create: false, edit: false }), [perm]: checked };
      };
      apply(sectionKey as CrmAreaKey);
      section.areas.forEach((a) => apply(a.key as CrmAreaKey));
      return next;
    });
  }

  function toggleSectionAll(sectionKey: SectionKey, checked: boolean) {
    const section = CRM_SECTIONS.find((s) => s.key === sectionKey)!;
    setPermissions((prev) => {
      const next = { ...prev };
      const val = { view: checked, create: checked, edit: checked };
      next[sectionKey as CrmAreaKey] = val;
      section.areas.forEach((a) => {
        next[a.key as CrmAreaKey] = val;
      });
      return next;
    });
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
      if (error) toast({ title: "Erro ao criar nível", description: error.message, variant: "destructive" });
      else toast({ title: "Nível de acesso criado" });
    } else if (editLevel?.id) {
      const { error } = await supabase
        .from("access_levels")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          permissions: permissions as any,
        })
        .eq("id", editLevel.id);
      if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      else toast({ title: "Nível atualizado" });
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
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Nível excluído" });
      onUpdate();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-lg">Níveis de Acesso</h3>
          <p className="text-sm text-muted-foreground">
            Defina permissões por seção e subseção. Desabilitar a seção bloqueia o grupo inteiro.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Nível
        </Button>
      </div>

      <div className="grid gap-3">
        {levels.map((level) => {
          const perms = (level.permissions || {}) as Permissions;
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
                        {CRM_SECTIONS.map((section) => {
                          const sp = perms[section.key as CrmAreaKey];
                          const anyArea = section.areas.some((a) => {
                            const p = perms[a.key as CrmAreaKey];
                            return p?.view || p?.create || p?.edit;
                          });
                          if (!sp?.view && !sp?.create && !sp?.edit && !anyArea) return null;
                          const enabledCount = section.areas.filter((a) => {
                            const p = perms[a.key as CrmAreaKey];
                            return p?.view;
                          }).length;
                          return (
                            <Badge key={section.key} variant="secondary" className="text-xs">
                              {section.label}
                              <span className="ml-1 opacity-60">{enabledCount}/{section.areas.length}</span>
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

      <Dialog open={!!editLevel} onOpenChange={(open) => !open && setEditLevel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo Nível de Acesso" : "Editar Nível de Acesso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Gerente" />
              </div>
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva as responsabilidades deste nível" rows={1} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Permissões por Seção</Label>
              <p className="text-xs text-muted-foreground">
                A permissão da seção controla o acesso ao grupo inteiro. Se desligada, todas as subseções ficam inacessíveis.
              </p>

              <div className="space-y-2">
                {CRM_SECTIONS.map((section) => {
                  const sp = permissions[section.key as CrmAreaKey] || { view: false, create: false, edit: false };
                  const sectionAll = sp.view && sp.create && sp.edit
                    && section.areas.every((a) => {
                      const p = permissions[a.key as CrmAreaKey];
                      return p?.view && p?.create && p?.edit;
                    });
                  return (
                    <Collapsible key={section.key} defaultOpen>
                      <div className="border rounded-lg overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center justify-between w-full px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90" />
                              <span className="font-medium text-sm">{section.label}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {section.areas.length} subseções
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <Checkbox
                                  checked={sp.view}
                                  onCheckedChange={(c) => toggleSection(section.key, "view", !!c)}
                                />
                                <span>Visualizar</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <Checkbox
                                  checked={sp.create}
                                  onCheckedChange={(c) => toggleSection(section.key, "create", !!c)}
                                />
                                <span>Criar</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <Checkbox
                                  checked={sp.edit}
                                  onCheckedChange={(c) => toggleSection(section.key, "edit", !!c)}
                                />
                                <span>Editar</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer border-l pl-3">
                                <Checkbox
                                  checked={sectionAll}
                                  onCheckedChange={(c) => toggleSectionAll(section.key, !!c)}
                                />
                                <span className="font-medium">Tudo</span>
                              </label>
                            </div>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[200px]">Subseção</TableHead>
                                <TableHead className="text-center w-20">Visualizar</TableHead>
                                <TableHead className="text-center w-20">Criar</TableHead>
                                <TableHead className="text-center w-20">Editar</TableHead>
                                <TableHead className="text-center w-16">Todos</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {section.areas.map((area) => {
                                const p = permissions[area.key as CrmAreaKey] || { view: false, create: false, edit: false };
                                const allChecked = p.view && p.create && p.edit;
                                const sectionBlocked = !sp.view;
                                return (
                                  <TableRow key={area.key} className={cn(sectionBlocked && "opacity-50")}>
                                    <TableCell className="font-medium text-sm">{area.label}</TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox checked={p.view} onCheckedChange={() => togglePermission(area.key as CrmAreaKey, "view")} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox checked={p.create} onCheckedChange={() => togglePermission(area.key as CrmAreaKey, "create")} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox checked={p.edit} onCheckedChange={() => togglePermission(area.key as CrmAreaKey, "edit")} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAllForArea(area.key as CrmAreaKey, !!c)} />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
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

// Helper para mapear área → seção pai
export function getSectionForArea(area: CrmAreaKey): SectionKey | null {
  for (const s of CRM_SECTIONS) {
    if (s.key === area) return s.key;
    if (s.areas.some((a) => a.key === area)) return s.key;
  }
  return null;
}
