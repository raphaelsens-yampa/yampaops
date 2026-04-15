import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type GoalScope = "company" | "team" | "user" | "channel" | "campaign";

const SCOPE_LABELS: Record<GoalScope, string> = {
  company: "Empresa",
  team: "Equipe",
  user: "Vendedor",
  channel: "Canal",
  campaign: "Campanha",
};

export default function GoalsPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filterScope, setFilterScope] = useState<string>("all");

  // Form state
  const [gScope, setGScope] = useState<GoalScope>("company");
  const [gChannel, setGChannel] = useState<string>("all");
  const [gUser, setGUser] = useState<string>("none");
  const [gTeam, setGTeam] = useState<string>("none");
  const [gCampaign, setGCampaign] = useState("");
  const [gStart, setGStart] = useState("");
  const [gEnd, setGEnd] = useState("");
  const [gMrr, setGMrr] = useState("");
  const [gDeals, setGDeals] = useState("");
  const [gArpa, setGArpa] = useState("");
  const [gProspeccoes, setGProspeccoes] = useState("");
  const [gRespostas, setGRespostas] = useState("");
  const [gAgendamentos, setGAgendamentos] = useState("");
  const [gComparecimentos, setGComparecimentos] = useState("");
  const [gConversoes, setGConversoes] = useState("");
  const [gTaxaResposta, setGTaxaResposta] = useState("");
  const [gTaxaAgendamento, setGTaxaAgendamento] = useState("");
  const [gTaxaComparecimento, setGTaxaComparecimento] = useState("");
  const [gTaxaConversao, setGTaxaConversao] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [goalsRes, profsRes, teamsRes] = await Promise.all([
      role === "admin" ? supabase.from("goals").select("*") : supabase.from("goals").select("*").eq("user_id", user!.id),
      supabase.from("profiles").select("*"),
      supabase.from("teams").select("*"),
    ]);
    setGoals(goalsRes.data || []);
    setProfiles(profsRes.data || []);
    setTeams(teamsRes.data || []);
    setLoading(false);
  }

  function resetForm() {
    setGScope("company"); setGChannel("all"); setGUser("none"); setGTeam("none"); setGCampaign("");
    setGStart(""); setGEnd(""); setGMrr(""); setGDeals(""); setGArpa("");
    setGProspeccoes(""); setGRespostas(""); setGAgendamentos("");
    setGComparecimentos(""); setGConversoes("");
    setGTaxaResposta(""); setGTaxaAgendamento(""); setGTaxaComparecimento(""); setGTaxaConversao("");
  }

  async function createGoal() {
    if (!gStart || !gEnd) return;
    const parseRate = (v: string) => v ? parseFloat(v) / 100 : null;
    const { error } = await supabase.from("goals").insert({
      scope: gScope,
      channel: gScope === "channel" ? (gChannel === "all" ? null : gChannel as any) : (gChannel === "all" ? null : gChannel as any),
      user_id: gScope === "user" ? (gUser === "none" ? null : gUser) : null,
      team_id: gScope === "team" ? (gTeam === "none" ? null : gTeam) : null,
      campaign: gScope === "campaign" ? gCampaign || null : null,
      period_start: gStart, period_end: gEnd,
      target_mrr: parseFloat(gMrr) || 0,
      target_deals: parseInt(gDeals) || 0,
      target_tpv: parseFloat(gArpa) || 0,
      target_prospeccoes: parseInt(gProspeccoes) || 0,
      target_respostas: parseInt(gRespostas) || 0,
      target_agendamentos: parseInt(gAgendamentos) || 0,
      target_comparecimentos: parseInt(gComparecimentos) || 0,
      target_conversoes: parseInt(gConversoes) || 0,
      target_taxa_resposta: parseRate(gTaxaResposta),
      target_taxa_agendamento: parseRate(gTaxaAgendamento),
      target_taxa_comparecimento: parseRate(gTaxaComparecimento),
      target_taxa_conversao: parseRate(gTaxaConversao),
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    resetForm();
    loadData();
  }

  async function deleteGoal(id: string) {
    await supabase.from("goals").delete().eq("id", id);
    loadData();
  }

  const filteredGoals = filterScope === "all" ? goals : goals.filter(g => g.scope === filterScope);

  if (loading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Metas</h1>
          <div className="flex items-center gap-2">
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
                  <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold">Escopo da Meta</Label>
                      <Select value={gScope} onValueChange={v => setGScope(v as GoalScope)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SCOPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {gScope === "channel" && (
                      <Select value={gChannel} onValueChange={setGChannel}>
                        <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os canais</SelectItem>
                          {Object.entries(ORIGIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}

                    {gScope === "user" && (
                      <Select value={gUser} onValueChange={setGUser}>
                        <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}

                    {gScope === "team" && (
                      <Select value={gTeam} onValueChange={setGTeam}>
                        <SelectTrigger><SelectValue placeholder="Equipe" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}

                    {gScope === "campaign" && (
                      <Input placeholder="Nome da campanha" value={gCampaign} onChange={e => setGCampaign(e.target.value)} />
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Início</Label><Input type="date" value={gStart} onChange={e => setGStart(e.target.value)} /></div>
                      <div><Label>Fim</Label><Input type="date" value={gEnd} onChange={e => setGEnd(e.target.value)} /></div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Metas de resultado</Label>
                      <Input type="number" placeholder="MRR Alvo (R$)" value={gMrr} onChange={e => setGMrr(e.target.value)} />
                      <Input type="number" placeholder="Qtd Deals" value={gDeals} onChange={e => setGDeals(e.target.value)} />
                      <Input type="number" placeholder="ARPA Alvo (R$)" value={gArpa} onChange={e => setGArpa(e.target.value)} />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Volume por etapa do funil</Label>
                      <Input type="number" placeholder="Prospecções" value={gProspeccoes} onChange={e => setGProspeccoes(e.target.value)} />
                      <Input type="number" placeholder="Respostas" value={gRespostas} onChange={e => setGRespostas(e.target.value)} />
                      <Input type="number" placeholder="Agendamentos" value={gAgendamentos} onChange={e => setGAgendamentos(e.target.value)} />
                      <Input type="number" placeholder="Comparecimentos" value={gComparecimentos} onChange={e => setGComparecimentos(e.target.value)} />
                      <Input type="number" placeholder="Conversões" value={gConversoes} onChange={e => setGConversoes(e.target.value)} />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Meta de conversão por etapa (%)</Label>
                      <Input type="number" placeholder="Prospecção → Resposta (%)" value={gTaxaResposta} onChange={e => setGTaxaResposta(e.target.value)} />
                      <Input type="number" placeholder="Resposta → Agendamento (%)" value={gTaxaAgendamento} onChange={e => setGTaxaAgendamento(e.target.value)} />
                      <Input type="number" placeholder="Agendamento → Comparecimento (%)" value={gTaxaComparecimento} onChange={e => setGTaxaComparecimento(e.target.value)} />
                      <Input type="number" placeholder="Comparecimento → Conversão (%)" value={gTaxaConversao} onChange={e => setGTaxaConversao(e.target.value)} />
                    </div>

                    <Button onClick={createGoal} className="w-full">Criar Meta</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(SCOPE_LABELS).map(([key, label]) => {
            const count = goals.filter(g => g.scope === key).length;
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
                  <TableHead>Detalhes</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">MRR Alvo</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">ARPA</TableHead>
                  {role === "admin" && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGoals.map(g => {
                  const prof = profiles.find(p => p.user_id === g.user_id);
                  const team = teams.find(t => t.id === g.team_id);
                  let details = "—";
                  if (g.scope === "user") details = prof?.full_name || "—";
                  else if (g.scope === "team") details = team?.name || "—";
                  else if (g.scope === "channel") details = g.channel ? (ORIGIN_LABELS[g.channel] || g.channel) : "Todos";
                  else if (g.scope === "campaign") details = g.campaign || "—";
                  else details = "Toda empresa";

                  return (
                    <TableRow key={g.id}>
                      <TableCell><Badge variant="outline">{SCOPE_LABELS[g.scope as GoalScope] || g.scope || "Empresa"}</Badge></TableCell>
                      <TableCell className="text-sm">{details}</TableCell>
                      <TableCell className="text-sm">{g.period_start} → {g.period_end}</TableCell>
                      <TableCell className="text-right">R$ {(g.target_mrr || 0).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{g.target_deals || 0}</TableCell>
                      <TableCell className="text-right">R$ {(g.target_tpv || 0).toLocaleString("pt-BR")}</TableCell>
                      {role === "admin" && (
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteGoal(g.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {filteredGoals.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma meta</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
