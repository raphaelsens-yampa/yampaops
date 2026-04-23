import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, UserPlus, Pencil, Users } from "lucide-react";
import { AccessLevelManager, CRM_AREAS, type AccessLevel, type Permissions } from "@/components/AccessLevelManager";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  access_level_id: string | null;
  access_level_name: string | null;
  created_at: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("seller");
  const [newAccessLevelId, setNewAccessLevelId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const [profilesRes, rolesRes, levelsRes, assignmentsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("access_levels").select("*").order("created_at"),
      supabase.from("user_access_levels").select("*"),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    const levels = (levelsRes.data || []) as unknown as AccessLevel[];
    const assignments = assignmentsRes.data || [];

    setAccessLevels(levels);

    const merged: UserRow[] = profiles.map((p) => {
      const r = roles.find((r) => r.user_id === p.user_id);
      const assignment = assignments.find((a) => a.user_id === p.user_id);
      const level = assignment ? levels.find((l) => l.id === assignment.access_level_id) : null;
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        role: (r?.role as AppRole) || "seller",
        access_level_id: assignment?.access_level_id || null,
        access_level_name: level?.name || null,
        created_at: p.created_at,
      };
    });

    merged.sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

    setUsers(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSaveUser() {
    if (!editingUser) return;
    setSaving(true);

    // Update role
    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", editingUser.user_id);

    if (roleError) {
      toast({ title: "Erro ao atualizar papel", description: roleError.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Update access level assignment
    if (newAccessLevelId) {
      // Upsert: delete existing then insert
      await supabase.from("user_access_levels").delete().eq("user_id", editingUser.user_id);
      const { error: alError } = await supabase.from("user_access_levels").insert({
        user_id: editingUser.user_id,
        access_level_id: newAccessLevelId,
      });
      if (alError) {
        toast({ title: "Erro ao atribuir nível", description: alError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      // Remove access level
      await supabase.from("user_access_levels").delete().eq("user_id", editingUser.user_id);
    }

    toast({ title: "Usuário atualizado" });
    await loadData();
    setSaving(false);
    setEditingUser(null);
  }

  if (loading) {
    return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const sellerCount = users.filter((u) => u.role === "seller").length;

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-heading font-bold">Administração de Usuários</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Usuários</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Administradores</p>
                <p className="text-2xl font-bold">{adminCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendedores</p>
                <p className="text-2xl font-bold">{sellerCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="levels">Níveis de Acesso</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Usuários da Plataforma</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Nível de Acesso</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const isSelf = u.user_id === user?.id;
                      return (
                        <TableRow key={u.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase">
                                {(u.full_name || "?")[0]}
                              </div>
                              <div>
                                <p className="font-medium">{u.full_name || "—"}</p>
                                {isSelf && <span className="text-xs text-muted-foreground">(você)</span>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role === "admin" ? "Admin" : "Seller"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {u.access_level_name ? (
                              <Badge variant="outline">{u.access_level_name}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Não atribuído</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(u.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => {
                                setEditingUser(u);
                                setNewRole(u.role);
                                setNewAccessLevelId(u.access_level_id || "");
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="levels" className="mt-4">
            <AccessLevelManager levels={accessLevels} onUpdate={loadData} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-muted-foreground text-sm">Usuário</Label>
              <p className="font-medium">{editingUser?.full_name || "—"}</p>
            </div>
            <div className="space-y-2">
              <Label>Papel Base</Label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as AppRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — controle total do sistema</SelectItem>
                  <SelectItem value="tatico">Tático — vê todos os dados, sem gerenciar</SelectItem>
                  <SelectItem value="seller">Seller — vê apenas suas próprias oportunidades</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Define o acesso base aos dados (RLS). As permissões finas de UI vêm do Nível de Acesso abaixo.</p>
            </div>
            <div className="space-y-2">
              <Label>Nível de Acesso</Label>
              <Select value={newAccessLevelId} onValueChange={setNewAccessLevelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar nível..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {accessLevels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                      {l.description ? ` — ${l.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">O nível de acesso define permissões granulares de visualização, criação e edição por área.</p>
            </div>

            {/* Preview permissions */}
            {newAccessLevelId && newAccessLevelId !== "none" && (() => {
              const level = accessLevels.find((l) => l.id === newAccessLevelId);
              if (!level) return null;
              const perms = level.permissions as Permissions;
              return (
                <div className="space-y-1">
                  <Label className="text-sm">Permissões do nível "{level.name}"</Label>
                  <div className="flex flex-wrap gap-1">
                    {CRM_AREAS.map((area) => {
                      const p = perms[area.key];
                      if (!p?.view && !p?.create && !p?.edit) return null;
                      return (
                        <Badge key={area.key} variant="secondary" className="text-xs">
                          {area.label}: {[p.view && "Ver", p.create && "Criar", p.edit && "Editar"].filter(Boolean).join(", ")}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
