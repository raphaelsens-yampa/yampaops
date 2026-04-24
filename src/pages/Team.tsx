import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Plus, Trash2, Pencil, Users, UsersRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TeamPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Team form
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");

  // Member form
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [p, l, a, r, t, tm] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("opportunities").select("*"),
      supabase.from("activities").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("teams").select("*"),
      supabase.from("team_members").select("*"),
    ]);
    setProfiles(p.data || []);
    setLeads(l.data || []);
    setActivities(a.data || []);
    setRoles(r.data || []);
    setTeams(t.data || []);
    setTeamMembers(tm.data || []);
    setLoading(false);
  }

  async function saveTeam() {
    if (!teamName.trim()) return;
    if (editingTeam?.id) {
      const { error } = await supabase.from("teams").update({ name: teamName.trim(), description: teamDesc || null }).eq("id", editingTeam.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Equipe atualizada" });
    } else {
      const { error } = await supabase.from("teams").insert({ name: teamName.trim(), description: teamDesc || null });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Equipe criada" });
    }
    setTeamDialogOpen(false);
    setEditingTeam(null);
    setTeamName("");
    setTeamDesc("");
    loadData();
  }

  async function deleteTeam(id: string) {
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Equipe excluída" });
    loadData();
  }

  async function addMember() {
    if (!selectedTeamId || !selectedUserId) return;
    const { error } = await supabase.from("team_members").insert({
      team_id: selectedTeamId, user_id: selectedUserId, role_in_team: selectedRole,
    });
    if (error) {
      toast({ title: "Erro", description: error.message.includes("duplicate") ? "Usuário já está nesta equipe" : error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Membro adicionado" });
    setMemberDialogOpen(false);
    setSelectedUserId("");
    loadData();
  }

  async function removeMember(id: string) {
    await supabase.from("team_members").delete().eq("id", id);
    toast({ title: "Membro removido" });
    loadData();
  }

  // Sales velocity chart
  const wonLeads = leads.filter(l => l.converted_at || l.stage === "fechado_won" || l.stage === "ganho");
  const velocityByChannel: Record<string, { total: number; count: number }> = {};
  wonLeads.forEach(l => {
    const wonAt = l.converted_at || l.updated_at;
    const days = (new Date(wonAt).getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (!velocityByChannel[l.origin]) velocityByChannel[l.origin] = { total: 0, count: 0 };
    velocityByChannel[l.origin].total += days;
    velocityByChannel[l.origin].count++;
  });
  const velocityChart = Object.entries(velocityByChannel).map(([k, v]) => ({
    name: ORIGIN_LABELS[k] || k,
    dias: v.count > 0 ? Math.round(v.total / v.count) : 0,
  }));

  if (loading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-heading font-bold">Equipe</h1>

        <Tabs defaultValue="teams">
          <TabsList>
            <TabsTrigger value="teams"><UsersRound className="h-4 w-4 mr-1" /> Equipes</TabsTrigger>
            <TabsTrigger value="members"><Users className="h-4 w-4 mr-1" /> Membros</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="space-y-4">
            {role === "admin" && (
              <div className="flex justify-end">
                <Dialog open={teamDialogOpen} onOpenChange={(v) => { setTeamDialogOpen(v); if (!v) { setEditingTeam(null); setTeamName(""); setTeamDesc(""); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Equipe</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{editingTeam ? "Editar Equipe" : "Nova Equipe"}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Nome</Label><Input value={teamName} onChange={e => setTeamName(e.target.value)} /></div>
                      <div><Label>Descrição</Label><Textarea value={teamDesc} onChange={e => setTeamDesc(e.target.value)} /></div>
                    </div>
                    <DialogFooter>
                      <Button onClick={saveTeam}>{editingTeam ? "Salvar" : "Criar"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Membros</TableHead>
                      {role === "admin" && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams.map(t => {
                      const count = teamMembers.filter(tm => tm.team_id === t.id).length;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{t.description || "—"}</TableCell>
                          <TableCell className="text-right">{count}</TableCell>
                          {role === "admin" && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                  setEditingTeam(t); setTeamName(t.name); setTeamDesc(t.description || ""); setTeamDialogOpen(true);
                                }}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTeam(t.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {teams.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhuma equipe</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {role === "admin" && (
              <div className="flex justify-end">
                <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar Membro</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Adicionar Membro à Equipe</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Equipe</Label>
                        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Usuário</Label>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Papel</Label>
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Membro</SelectItem>
                            <SelectItem value="leader">Líder</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter><Button onClick={addMember}>Adicionar</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Papel no Time</TableHead>
                      <TableHead>Papel no Sistema</TableHead>
                      <TableHead className="text-right">Oportunidades</TableHead>
                      {role === "admin" && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map(tm => {
                      const prof = profiles.find(p => p.user_id === tm.user_id);
                      const team = teams.find(t => t.id === tm.team_id);
                      const userRole = roles.find(r => r.user_id === tm.user_id);
                      const userLeads = leads.filter(l => l.consultant_id === tm.user_id);
                      return (
                        <TableRow key={tm.id}>
                          <TableCell className="font-medium">{prof?.full_name || "—"}</TableCell>
                          <TableCell>{team?.name || "—"}</TableCell>
                          <TableCell><Badge variant={tm.role_in_team === "leader" ? "default" : "secondary"}>{tm.role_in_team === "leader" ? "Líder" : "Membro"}</Badge></TableCell>
                          <TableCell><Badge variant={userRole?.role === "admin" ? "default" : "outline"}>{userRole?.role || "seller"}</Badge></TableCell>
                          <TableCell className="text-right">{userLeads.length}</TableCell>
                          {role === "admin" && (
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeMember(tm.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {teamMembers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum membro associado</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead className="text-right">Oportunidades</TableHead>
                      <TableHead className="text-right">Deals Won</TableHead>
                      <TableHead className="text-right">Atividades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map(p => {
                      const userRole = roles.find(r => r.user_id === p.user_id);
                      const userLeads = leads.filter(l => l.consultant_id === p.user_id);
                      const userWon = userLeads.filter(l => l.converted_at || l.stage === "fechado_won" || l.stage === "ganho");
                      const userActs = activities.filter(a => a.user_id === p.user_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                          <TableCell><Badge variant={userRole?.role === "admin" ? "default" : "secondary"}>{userRole?.role || "seller"}</Badge></TableCell>
                          <TableCell className="text-right">{userLeads.length}</TableCell>
                          <TableCell className="text-right">{userWon.length}</TableCell>
                          <TableCell className="text-right">{userActs.length}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {velocityChart.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Velocidade de Venda por Canal (dias)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={velocityChart}>
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="dias" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
