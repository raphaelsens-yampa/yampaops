import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function GoalsPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [gChannel, setGChannel] = useState<string>("all");
  const [gUser, setGUser] = useState<string>("none");
  const [gStart, setGStart] = useState("");
  const [gEnd, setGEnd] = useState("");
  const [gMrr, setGMrr] = useState("");
  const [gDeals, setGDeals] = useState("");
  const [gTpv, setGTpv] = useState("");

  // Stage volume targets
  const [gProspeccoes, setGProspeccoes] = useState("");
  const [gRespostas, setGRespostas] = useState("");
  const [gAgendamentos, setGAgendamentos] = useState("");
  const [gComparecimentos, setGComparecimentos] = useState("");
  const [gConversoes, setGConversoes] = useState("");

  // Stage conversion rate targets (%)
  const [gTaxaResposta, setGTaxaResposta] = useState("");
  const [gTaxaAgendamento, setGTaxaAgendamento] = useState("");
  const [gTaxaComparecimento, setGTaxaComparecimento] = useState("");
  const [gTaxaConversao, setGTaxaConversao] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [goalsRes, profsRes] = await Promise.all([
      role === "admin" ? supabase.from("goals").select("*") : supabase.from("goals").select("*").eq("user_id", user!.id),
      supabase.from("profiles").select("*"),
    ]);
    setGoals(goalsRes.data || []);
    setProfiles(profsRes.data || []);
    setLoading(false);
  }

  function resetForm() {
    setGChannel("all"); setGUser("none"); setGStart(""); setGEnd("");
    setGMrr(""); setGDeals(""); setGTpv("");
    setGProspeccoes(""); setGRespostas(""); setGAgendamentos("");
    setGComparecimentos(""); setGConversoes("");
    setGTaxaResposta(""); setGTaxaAgendamento(""); setGTaxaComparecimento(""); setGTaxaConversao("");
  }

  async function createGoal() {
    if (!gStart || !gEnd) return;
    const parseRate = (v: string) => v ? parseFloat(v) / 100 : null;
    const { error } = await supabase.from("goals").insert({
      channel: gChannel === "all" ? null : gChannel as any,
      user_id: gUser === "none" ? null : gUser,
      period_start: gStart, period_end: gEnd,
      target_mrr: parseFloat(gMrr) || 0,
      target_deals: parseInt(gDeals) || 0,
      target_tpv: parseFloat(gTpv) || 0,
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

  if (loading) return <Layout><p className="text-muted-foreground p-8">Carregando...</p></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Metas</h1>
          {role === "admin" && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Meta</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Select value={gChannel} onValueChange={setGChannel}>
                    <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os canais</SelectItem>
                      {Object.entries(ORIGIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={gUser} onValueChange={setGUser}>
                    <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Canal (sem vendedor)</SelectItem>
                      {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={gStart} onChange={e => setGStart(e.target.value)} />
                    <Input type="date" value={gEnd} onChange={e => setGEnd(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Metas de resultado</Label>
                    <Input type="number" placeholder="MRR Alvo (R$)" value={gMrr} onChange={e => setGMrr(e.target.value)} />
                    <Input type="number" placeholder="Qtd Deals" value={gDeals} onChange={e => setGDeals(e.target.value)} />
                    <Input type="number" placeholder="TPV Alvo (R$)" value={gTpv} onChange={e => setGTpv(e.target.value)} />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Metas de volume por etapa do funil</Label>
                    <Input type="number" placeholder="Prospecções (topo de funil)" value={gProspeccoes} onChange={e => setGProspeccoes(e.target.value)} />
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

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">MRR Alvo</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">TPV</TableHead>
                  {role === "admin" && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map(g => {
                  const prof = profiles.find(p => p.user_id === g.user_id);
                  return (
                    <TableRow key={g.id}>
                      <TableCell>{g.channel ? ORIGIN_LABELS[g.channel] || g.channel : "Todos"}</TableCell>
                      <TableCell>{prof?.full_name || "—"}</TableCell>
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
                {goals.length === 0 && (
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
