import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Shield, UserPlus, Pencil, Users } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  created_at: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("seller");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];

    const merged: UserRow[] = profiles.map((p) => {
      const r = roles.find((r) => r.user_id === p.user_id);
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        role: (r?.role as AppRole) || "seller",
        created_at: p.created_at,
      };
    });

    // Sort admins first, then alphabetically
    merged.sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

    setUsers(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleRoleChange() {
    if (!editingUser) return;
    setSaving(true);

    // Update the role in user_roles
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", editingUser.user_id);

    if (error) {
      toast({ title: "Erro ao atualizar papel", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Papel atualizado", description: `${editingUser.full_name} agora é ${newRole === "admin" ? "Administrador" : "Vendedor"}.` });
      await loadUsers();
    }

    setSaving(false);
    setEditingUser(null);
  }

  const roleLabel = (role: AppRole) => role === "admin" ? "Administrador" : "Vendedor";

  if (loading) {
    return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const sellerCount = users.filter((u) => u.role === "seller").length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Administração de Usuários</h1>
        </div>

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

        {/* Users table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Usuários da Plataforma</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
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
                          {u.role === "admin" ? "Administrador" : "Vendedor"}
                        </Badge>
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
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Nível de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-muted-foreground text-sm">Usuário</Label>
              <p className="font-medium">{editingUser?.full_name || "—"}</p>
            </div>
            <div className="space-y-2">
              <Label>Nível de Acesso</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador — acesso total ao painel gerencial</SelectItem>
                  <SelectItem value="seller">Vendedor — acesso ao pipeline e metas próprias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleRoleChange} disabled={saving || newRole === editingUser?.role}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
