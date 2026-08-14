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

import { CategoryManager } from "@/components/goals/CategoryManager";
import { FinanceSettings } from "@/components/goals/FinanceSettings";
import { MetabaseTracking } from "@/components/goals/MetabaseTracking";
import { TacticalTracking } from "@/components/goals/tactical/TacticalTracking";
import { GoalsImportDialog } from "@/components/goals/GoalsImportDialog";

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
  const [filterCategory, setFilterCategory] = useState<string>("all");

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
  const [gPct, setGPct] = useState("");
  const [gCategory, setGCategory] = useState<string>("none");

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  async function loadCategories() {
    const { data } = await supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name");
    setCategories((data as GoalCategory[]) || []);
  }

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
    setGStart(""); setGEnd(""); setGMrr(""); setGDeals(""); setGArpa(""); setGPct("");
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
    setGPct(goal.target_pct ? goal.target_pct.toString() : "");
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
      target_pct: parseFloat(gPct) || 0,
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

  const filteredGoals = goals.filter((g) => {
    if (filterScope !== "all" && g.scope !== filterScope) return false;
    if (filterCategory !== "all") {
      if (filterCategory === "none" ? g.category_id : g.category_id !== filterCategory) return false;
    }
    return true;
  });

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
        <Input type="number" step="0.01" placeholder="Percentual Alvo (%)" value={gPct} onChange={(e) => setGPct(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Use o campo percentual para métricas de razão, como Churn % (logos).
        </p>
      </div>

      <Button onClick={saveGoal} className="w-full">
        {editingGoal ? "Salvar Alterações" : "Criar Meta"}
      </Button>
    </div>
  );

  const isManager = role === "admin" || role === "tatico";

  return (
    <Layout>
      <div className="space-y-5 md:space-y-6">
        <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 pt-1 pb-2 md:pb-0 bg-background/85 backdrop-blur-md md:bg-transparent md:backdrop-blur-none md:static border-b border-border/60 md:border-0">
          <h1 className="text-xl sm:text-2xl font-heading font-bold">Metas</h1>
        </div>

        <Tabs defaultValue="metabase" className="space-y-5 md:space-y-6" onValueChange={(v) => { if (v === "setup") loadCategories(); }}>
          <div className="-mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 overflow-x-auto no-scrollbar">
            <TabsList className="w-max min-w-full justify-start gap-1">
              <TabsTrigger value="metabase" className="whitespace-nowrap">
                <span className="md:hidden">Metas</span>
                <span className="hidden md:inline">Acompanhamento Metas</span>
              </TabsTrigger>
              <TabsTrigger value="tactical" className="whitespace-nowrap">
                <span className="md:hidden">Táticas</span>
                <span className="hidden md:inline">Metas Táticas</span>
              </TabsTrigger>
              {isManager && (
                <TabsTrigger value="setup" className="whitespace-nowrap">
                  <span className="md:hidden">Cadastro</span>
                  <span className="hidden md:inline">Cadastro de Metas</span>
                </TabsTrigger>
              )}
              {role === "admin" && <TabsTrigger value="categories" className="whitespace-nowrap">Categorias</TabsTrigger>}
              {role === "admin" && (
                <TabsTrigger value="finance" className="whitespace-nowrap">
                  <span className="md:hidden">Financeiro</span>
                  <span className="hidden md:inline">Configurações Financeiras</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>


          <TabsContent value="metabase" className="space-y-6">
            <MetabaseTracking />
          </TabsContent>

          <TabsContent value="tactical" className="space-y-6">
            <TacticalTracking />
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

          {isManager && (
          <TabsContent value="setup" className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Select value={filterScope} onValueChange={setFilterScope}>
                <SelectTrigger className="w-full sm:w-36 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os escopos</SelectItem>
                  {Object.entries(SCOPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-56 h-10"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
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
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                {role === "admin" && (
                  <GoalsImportDialog
                    categories={categories}
                    profiles={profiles}
                    teams={teams}
                    campaigns={campaigns}
                    onImported={loadData}
                  />
                )}
                {role === "admin" && (
                  <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) loadCategories(); else resetForm(); }}>
                    <DialogTrigger asChild>
                      <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1" /> Nova Meta</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full max-h-[85vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>{editingGoal ? "Editar Meta" : "Nova Meta"}</DialogTitle></DialogHeader>
                      {formContent}
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>


            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {Object.entries(SCOPE_LABELS).map(([key, label]) => {
                const count = goals.filter((g) => g.scope === key).length;
                const active = filterScope === key;
                return (
                  <Card
                    key={key}
                    className={`cursor-pointer transition-colors active:scale-[0.99] ${active ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                    onClick={() => setFilterScope(active ? "all" : key)}
                  >
                    <CardContent className="p-3 sm:p-4 text-center">
                      <p className="text-xl sm:text-2xl font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Lista mobile */}
            <div className="space-y-3 md:hidden">
              {filteredGoals.map((g) => {
                const prof = profiles.find((p) => p.user_id === g.user_id);
                const team = teams.find((t) => t.id === g.team_id);
                const camp = campaigns.find((c) => c.id === g.campaign_id);
                let details = "Toda empresa";
                if (g.scope === "user") details = prof?.full_name || "—";
                else if (g.scope === "team") details = team?.name || "—";
                else if (g.scope === "campaign") details = camp?.name || g.campaign || "—";
                const cat = categories.find((c) => c.id === g.category_id);
                return (
                  <Card key={g.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline">{SCOPE_LABELS[g.scope as GoalScope] || "Empresa"}</Badge>
                            {cat && <span className="text-xs text-muted-foreground truncate">{cat.name}</span>}
                          </div>
                          <p className="text-sm font-medium mt-1 truncate">{details}</p>
                          <p className="text-xs text-muted-foreground">{g.period_start} → {g.period_end}</p>
                        </div>
                        {role === "admin" && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Editar meta" onClick={() => openEditDialog(g)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Excluir meta" onClick={() => deleteGoal(g.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2 pt-1 border-t">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">MRR</p>
                          <p className="text-sm font-semibold">R$ {(g.target_mrr || 0).toLocaleString("pt-BR")}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deals</p>
                          <p className="text-sm font-semibold">{g.target_deals || 0}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">ARPA</p>
                          <p className="text-sm font-semibold">R$ {(g.target_tpv || 0).toLocaleString("pt-BR")}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">%</p>
                          <p className="text-sm font-semibold">
                            {Number(g.target_pct || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredGoals.length === 0 && (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhuma meta</CardContent></Card>
              )}
            </div>

            <Card className="hidden md:block">
              <CardContent className="p-0 overflow-x-auto">

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
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
