import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoalsTracking } from "@/components/goals/GoalsTracking";
import { CategoryManager } from "@/components/goals/CategoryManager";
import { FinanceSettings } from "@/components/goals/FinanceSettings";
import { AREA_LABELS, type GoalCategory } from "@/lib/goalCategories";

type GoalScope = "company" | "team" | "user" | "campaign";

const SCOPE_LABELS: Record<GoalScope, string> = {
  company: "Empresa",
  team: "Equipe",
  user: "Vendedor",
  campaign: "Campanha",
};

interface CampaignLite { id: string; name: string; }

export default function GoalsPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any | null>(null);
  const [filterScope, setFilterScope] = useState<string>("all");

  // Form state
  const [gScope, setGScope] = useState<GoalScope>("company");
  const [gUser, setGUser] = useState<string>("none");
  const [gTeam, setGTeam] = useState<string>("none");
  const [gCampaignId, setGCampaignId] = useState<string>("none");
  const [gStart, setGStart] = useState("");
  const [gEnd, setGEnd] = useState("");
  const [gMrr, setGMrr] = useState("");
  const [gDeals, setGDeals] = useState("");
  const [gArpa, setGArpa] = useState("");
  const [gCategory, setGCategory] = useState<string>("none");

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  async function loadData() {
    const [goalsRes, profsRes, teamsRes, catsRes, campRes] = await Promise.all([
      role === "admin" ? supabase.from("goals").select("*") : supabase.from("goals").select("*").eq("user_id", user!.id),
      supabase.from("profiles").select("*"),
      supabase.from("teams").select("*"),
      supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name"),
      supabase.from("sales_campaigns").select("id, name").order("name"),
    ]);
    setGoals(goalsRes.data || []);
    setProfiles(profsRes.data || []);
    setTeams(teamsRes.data || []);
    setCategories((catsRes.data as GoalCategory[]) || []);
    setCampaigns((campRes.data as CampaignLite[]) || []);
    setLoading(false);
  }

  function resetForm() {
    setGScope("company"); setGUser("none"); setGTeam("none"); setGCampaignId("none");
    setGStart(""); setGEnd(""); setGMrr(""); setGDeals(""); setGArpa("");
    setGCategory("none");
    setEditingGoal(null);
  }

  function openEditDialog(goal: any) {
    setEditingGoal(goal);
    setGScope((goal.scope as GoalScope) || "company");
    setGUser(goal.user_id || "none");
    setGTeam(goal.team_id || "none");
    setGCampaignId(goal.campaign_id || "none");
    setGStart(goal.period_start || "");
    setGEnd(goal.period_end || "");
    setGMrr(goal.target_mrr?.toString() || "");
    setGDeals(goal.target_deals?.toString() || "");
    setGArpa(goal.target_tpv?.toString() || "");
    setGCategory(goal.category_id || "none");
    setOpen(true);
  }

  function buildPayload() {
    return {
      scope: gScope,
      user_id: gScope === "user" ? (gUser === "none" ? null : gUser) : null,
      team_id: gScope === "team" ? (gTeam === "none" ? null : gTeam) : null,
      campaign_id: gScope === "campaign" ? (gCampaignId === "none" ? null : gCampaignId) : null,
      campaign: gScope === "campaign" ? (campaigns.find((c) => c.id === gCampaignId)?.name ?? null) : null,
      period_start: gStart, period_end: gEnd,
      target_mrr: parseFloat(gMrr) || 0,
      target_deals: parseInt(gDeals) || 0,
      target_tpv: parseFloat(gArpa) || 0,
      category_id: gCategory === "none" ? null : gCategory,
    };
  }

  async function saveGoal() {
    if (!gStart || !gEnd) return;
    const payload = buildPayload();
    let error;
    if (editingGoal) {
      ({ error } = await supabase.from("goals").update(payload).eq("id", editingGoal.id));
    } else {
      ({ error } = await supabase.from("goals").insert(payload));
    }
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    resetForm();
    loadData();
    toast({ title: editingGoal ? "Meta atualizada" : "Meta criada" });
  }

  async function deleteGoal(id: string) {
    await supabase.from("goals").delete().eq("id", id);
    loadData();
  }

  const filteredGoals = filterScope === "all" ? goals : goals.filter((g) => g.scope === filterScope);

  if (loading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  const formContent = (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold">Escopo da Meta</Label>
        <Select value={gScope} onValueChange={(v) => setGScope(v as GoalScope)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SCOPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-semibold">Categoria</Label>
        <Select value={gCategory} onValueChange={setGCategory}>
          <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem categoria</SelectItem>
            {(["sales","cs","campaign","financial"] as const).map((area) => {
              const items = categories.filter((c) => c.area === area);
              if (!items.length) return null;
              return (
                <div key={area}>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{AREA_LABELS[area]}</div>
                  {items.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </div>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {gScope === "user" && (
        <Select value={gUser} onValueChange={setGUser}>
          <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecione</SelectItem>
            {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {gScope === "team" && (
        <Select value={gTeam} onValueChange={setGTeam}>
          <SelectTrigger><SelectValue placeholder="Equipe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecione</SelectItem>
            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {gScope === "campaign" && (
        <Select value={gCampaignId} onValueChange={setGCampaignId}>
          <SelectTrigger><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecione</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div><Label>Início</Label><Input type="date" value={gStart} onChange={(e) => setGStart(e.target.value)} /></div>
        <div><Label>Fim</Label><Input type="date" value={gEnd} onChange={(e) => setGEnd(e.target.value)} /></div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Metas de resultado</Label>
        <Input type="number" placeholder="MRR Alvo (R$)" value={gMrr} onChange={(e) => setGMrr(e.target.value)} />
        <Input type="number" placeholder="Qtd Deals" value={gDeals} onChange={(e) => setGDeals(e.target.value)} />
        <Input type="number" placeholder="ARPA Alvo (R$)" value={gArpa} onChange={(e) => setGArpa(e.target.value)} />
      </div>

      <Button onClick={saveGoal} className="w-full">
        {editingGoal ? "Salvar Alterações" : "Criar Meta"}
      </Button>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Metas</h1>
        </div>

        <Tabs defaultValue="tracking" className="space-y-6">
          <TabsList>
            <TabsTrigger value="tracking">Acompanhamento</TabsTrigger>
            <TabsTrigger value="setup">Cadastro de Metas</TabsTrigger>
            {role === "admin" && <TabsTrigger value="categories">Categorias</TabsTrigger>}
            {role === "admin" && <TabsTrigger value="finance">Configurações Financeiras</TabsTrigger>}
          </TabsList>

          <TabsContent value="tracking" className="space-y-6">
            <GoalsTracking />
          </TabsContent>

          {role === "admin" && (
            <TabsContent value="categories" className="space-y-6">
              <CategoryManager />
            </TabsContent>
          )}

          {role === "admin" && (
            <TabsContent value="finance" className="space-y-6">
              <FinanceSettings />
            </TabsContent>
          )}

          <TabsContent value="setup" className="space-y-6">
            <div className="flex items-center justify-end gap-2">
              <Select value={filterScope} onValueChange={setFilterScope}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os escopos</SelectItem>
                  {Object.entries(SCOPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              {role === "admin" && (
                <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                  <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Meta</Button></DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{editingGoal ? "Editar Meta" : "Nova Meta"}</DialogTitle></DialogHeader>
                    {formContent}
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(SCOPE_LABELS).map(([key, label]) => {
                const count = goals.filter((g) => g.scope === key).length;
                return (
                  <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterScope(key)}>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Escopo</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Detalhes</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">MRR Alvo</TableHead>
                      <TableHead className="text-right">Deals</TableHead>
                      <TableHead className="text-right">ARPA</TableHead>
                      {role === "admin" && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGoals.map((g) => {
                      const prof = profiles.find((p) => p.user_id === g.user_id);
                      const team = teams.find((t) => t.id === g.team_id);
                      const camp = campaigns.find((c) => c.id === g.campaign_id);
                      let details = "—";
                      if (g.scope === "user") details = prof?.full_name || "—";
                      else if (g.scope === "team") details = team?.name || "—";
                      else if (g.scope === "campaign") details = camp?.name || g.campaign || "—";
                      else details = "Toda empresa";

                      const cat = categories.find((c) => c.id === g.category_id);
                      return (
                        <TableRow key={g.id}>
                          <TableCell><Badge variant="outline">{SCOPE_LABELS[g.scope as GoalScope] || g.scope || "Empresa"}</Badge></TableCell>
                          <TableCell className="text-sm">{cat ? cat.name : "—"}</TableCell>
                          <TableCell className="text-sm">{details}</TableCell>
                          <TableCell className="text-sm">{g.period_start} → {g.period_end}</TableCell>
                          <TableCell className="text-right">R$ {(g.target_mrr || 0).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right">{g.target_deals || 0}</TableCell>
                          <TableCell className="text-right">R$ {(g.target_tpv || 0).toLocaleString("pt-BR")}</TableCell>
                          {role === "admin" && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(g)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => deleteGoal(g.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {filteredGoals.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhuma meta</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
