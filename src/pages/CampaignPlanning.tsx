import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fetchAllPaged } from "@/lib/supabasePaged";
import {
  buildRatios, campaignType, forecastFromInvestment, GOAL_LABEL, reverseForGoal, SCENARIO_LABEL,
  usableCampaigns, type CampaignActuals, type GoalType, type ScenarioKey,
} from "@/lib/campaignForecast";

const brl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d });
const SCEN: ScenarioKey[] = ["pessimista", "esperado", "otimista"];

function useCampaignActuals() {
  return useQuery({
    queryKey: ["campaign-planning-actuals"],
    queryFn: async () => {
      const [{ data: camps, error: e1 }, { data: metrics, error: e2 }, { data: values, error: e3s }] = await Promise.all([
        supabase.from("campaign_history").select("id,name,channel,ref_month").limit(1000),
        supabase.from("campaign_history_metrics").select("id,slug").limit(1000),
        fetchAllPaged<any>(() => supabase.from("campaign_history_values").select("campaign_id,metric_id,actual_value").order("id") as any),
      ]);
      if (e1 || e2) throw new Error((e1 || e2)!.message);
      if (e3s) throw new Error(e3s);
      const slugById = new Map((metrics || []).map((m) => [m.id, m.slug]));
      const vals = new Map<string, Record<string, number>>();
      for (const v of values || []) {
        const slug = slugById.get(v.metric_id);
        if (!slug || v.actual_value == null) continue;
        const o = vals.get(v.campaign_id) || {};
        o[slug] = Number(v.actual_value);
        vals.set(v.campaign_id, o);
      }
      return (camps || []).map((c): CampaignActuals => {
        const v = vals.get(c.id) || {};
        return {
          id: c.id, name: c.name, type: campaignType(c.name), channel: c.channel, ref_month: c.ref_month,
          investment: v.investimento_liquido || v.investimento || 0,
          sales: v.conversao || 0, mrr: v.mrr || 0, ltvCac: v.ltv_cac ?? null, leads: v.leads_total ?? null,
        };
      }).sort((a, b) => (b.ref_month || "").localeCompare(a.ref_month || ""));
    },
  });
}

function useBaseMrr() {
  return useQuery({
    queryKey: ["campaign-planning-base-mrr"],
    queryFn: async () => {
      const { data } = await supabase
        .from("metas_snapshot_diario")
        .select("data,realized_amount")
        .eq("metric_key", "total_mrr").eq("scope", "company")
        .order("data", { ascending: false }).limit(1);
      return data?.[0] ? Number(data[0].realized_amount) : null;
    },
  });
}

export default function CampaignPlanning() {
  const { role, user } = useAuth();
  const canEdit = role === "admin" || role === "tatico";
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useCampaignActuals();
  const { data: baseMrrDb } = useBaseMrr();

  const [typeFilter, setTypeFilter] = useState("all");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [investment, setInvestment] = useState("20000");
  const [baseMrrInput, setBaseMrrInput] = useState("");
  const [ticketInput, setTicketInput] = useState("");
  const [goal, setGoal] = useState<GoalType>("mrr");
  const [goalValue, setGoalValue] = useState("10000");
  const [scenarioName, setScenarioName] = useState("");

  const types = useMemo(() => [...new Set(campaigns.map((c) => c.type))].sort(), [campaigns]);
  const base = useMemo(
    () => campaigns.filter((c) => (typeFilter === "all" || c.type === typeFilter) && !excluded.has(c.id)),
    [campaigns, typeFilter, excluded],
  );
  const usable = usableCampaigns(base);
  const ratios = useMemo(() => buildRatios(base), [base]);
  const baseMrr = baseMrrInput ? Number(baseMrrInput) : baseMrrDb ?? null;
  const inv = Number(investment) || 0;
  const gv = Number(goalValue) || 0;
  const ticketOverride = Number(ticketInput) > 0 ? Number(ticketInput) : null;
  // Ticket informado pelo usuário substitui o ticket histórico em todos os cenários.
  const effRatios = useMemo(() => {
    if (!ratios) return null;
    if (!ticketOverride) return ratios;
    return Object.fromEntries(SCEN.map((k) => [k, { ...ratios[k], ticket: ticketOverride }])) as typeof ratios;
  }, [ratios, ticketOverride]);

  const forward = effRatios ? SCEN.map((k) => ({ k, f: forecastFromInvestment(effRatios[k], inv, baseMrr) })) : [];
  const reverse = effRatios ? SCEN.map((k) => ({ k, r: reverseForGoal(effRatios[k], goal, gv, baseMrr, inv) })) : [];

  const saved = useQuery({
    queryKey: ["campaign-plan-scenarios"],
    queryFn: async () => {
      const { data } = await supabase.from("campaign_plan_scenarios").select("*").order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const save = async () => {
    if (!scenarioName.trim()) return toast.error("Dê um nome ao cenário");
    const { error } = await supabase.from("campaign_plan_scenarios").insert({
      name: scenarioName.trim(),
      base_campaign_ids: usable.map((c) => c.id),
      goal_type: goal, goal_value: gv, investment: inv,
      results: { forward, reverse, baseMrr, typeFilter, ticketOverride } as any,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Cenário salvo");
    setScenarioName("");
    qc.invalidateQueries({ queryKey: ["campaign-plan-scenarios"] });
  };
  const remove = async (id: string) => {
    await supabase.from("campaign_plan_scenarios").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["campaign-plan-scenarios"] });
  };

  const toggle = (id: string) =>
    setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Planejamento de Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Previsão com base no histórico das campanhas: cenário esperado (média), otimista e pessimista (melhores e piores campanhas).
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="text-base">Campanhas usadas como base</CardTitle>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {usable.length < 3 && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Histórico pequeno ({usable.length} campanha{usable.length === 1 ? "" : "s"} válida{usable.length === 1 ? "" : "s"}). A previsão é pouco confiável.
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Campanha</TableHead><TableHead>Tipo</TableHead><TableHead>Canal</TableHead>
                  <TableHead className="text-right">Invest. líquido</TableHead><TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">MRR</TableHead><TableHead className="text-right">CAC</TableHead>
                  <TableHead className="text-right">Ticket</TableHead><TableHead className="text-right">LTV/CAC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={10}>Carregando…</TableCell></TableRow>}
                {campaigns.filter((c) => typeFilter === "all" || c.type === typeFilter).map((c) => {
                  const valid = c.investment > 0 && c.sales > 0 && c.mrr > 0;
                  return (
                    <TableRow key={c.id} className={excluded.has(c.id) || !valid ? "opacity-50" : ""}>
                      <TableCell><Checkbox checked={!excluded.has(c.id) && valid} disabled={!valid} onCheckedChange={() => toggle(c.id)} aria-label={`Usar ${c.name}`} /></TableCell>
                      <TableCell className="font-medium">{c.name}{c.ref_month ? ` · ${c.ref_month.slice(5, 7)}/${c.ref_month.slice(0, 4)}` : ""}</TableCell>
                      <TableCell>{c.type}</TableCell><TableCell>{c.channel || "—"}</TableCell>
                      <TableCell className="text-right">{brl(c.investment)}</TableCell>
                      <TableCell className="text-right">{num(c.sales, 0)}</TableCell>
                      <TableCell className="text-right">{brl(c.mrr)}</TableCell>
                      <TableCell className="text-right">{brl(c.sales ? c.investment / c.sales : null)}</TableCell>
                      <TableCell className="text-right">{brl(c.sales ? c.mrr / c.sales : null)}</TableCell>
                      <TableCell className="text-right">{c.ltvCac != null ? `${num(c.ltvCac)}x` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Previsão para um investimento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label htmlFor="cp-inv">Investimento líquido (R$)</Label>
                <Input id="cp-inv" type="number" className="w-48" value={investment} onChange={(e) => setInvestment(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-base">MRR total atual (base do crescimento)</Label>
                <Input id="cp-base" type="number" className="w-56" placeholder={baseMrrDb ? String(Math.round(baseMrrDb)) : ""} value={baseMrrInput} onChange={(e) => setBaseMrrInput(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-ticket">Ticket médio (R$ por venda)</Label>
                <Input
                  id="cp-ticket" type="number" className="w-48"
                  placeholder={ratios ? String(Math.round(ratios.esperado.ticket)) : ""}
                  value={ticketInput} onChange={(e) => setTicketInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {ticketOverride
                    ? "Valor informado em uso (substitui o histórico)."
                    : ratios
                      ? `Vazio = histórico (média ${brl(ratios.esperado.ticket)}).`
                      : "Histórico das campanhas."}
                </p>
              </div>
            </div>
            {!ratios ? <p className="text-sm text-muted-foreground">Selecione campanhas com investimento, vendas e MRR.</p> : (
              <div className="grid gap-4 md:grid-cols-3">
                {forward.map(({ k, f }) => (
                  <Card key={k} className={k === "esperado" ? "border-primary" : ""}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{SCENARIO_LABEL[k]}</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <Row l="Vendas previstas" v={num(f.sales, 0)} />
                      <Row l="MRR gerado" v={brl(f.mrr)} strong />
                      <Row l="Crescimento a.m." v={f.growthPct == null ? "—" : `${num(f.growthPct, 2)}%`} />
                      <Row l="CAC" v={brl(f.cac)} />
                      <Row l="LTV por cliente" v={brl(f.ltvPerSale)} />
                      <Row l="LTV total" v={brl(f.ltvTotal)} />
                      <Row l="LTV/CAC" v={`${num(f.ltvCac)}x`} />
                      <Row l="ROI" v={`${num(f.roiPct, 0)}%`} />
                      <Row l="Payback" v={f.paybackMonths == null ? "—" : `${num(f.paybackMonths)} meses`} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Simulador reverso — quanto investir para a meta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label>Meta</Label>
                <Select value={goal} onValueChange={(v) => setGoal(v as GoalType)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(GOAL_LABEL) as GoalType[]).map((g) => <SelectItem key={g} value={g}>{GOAL_LABEL[g]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-goal">Valor da meta</Label>
                <Input id="cp-goal" type="number" className="w-40" value={goalValue} onChange={(e) => setGoalValue(e.target.value)} />
              </div>
            </div>
            {(goal === "ltv_cac" || goal === "roi") && (
              <p className="text-xs text-muted-foreground">Para metas de eficiência, o sistema calcula o custo máximo por venda (CAC máximo) e compara com o CAC de cada cenário, usando o investimento informado acima.</p>
            )}
            {ratios && (
              <div className="grid gap-4 md:grid-cols-3">
                {reverse.map(({ k, r }) => (
                  <Card key={k} className={k === "esperado" ? "border-primary" : ""}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{SCENARIO_LABEL[k]}</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {r.investment != null && <Row l="Investimento necessário" v={brl(r.investment)} strong />}
                      {r.maxCac != null && <Row l="CAC máximo permitido" v={brl(r.maxCac)} strong />}
                      {r.forecast && <Row l="CAC do cenário" v={brl(r.forecast.cac)} />}
                      {r.forecast && <Row l="Vendas" v={num(r.forecast.sales, 0)} />}
                      {r.forecast && <Row l="MRR" v={brl(r.forecast.mrr)} />}
                      {r.meets != null && (
                        <Badge className={r.meets ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                          {r.meets ? "Atinge a meta" : "Não atinge a meta"}
                        </Badge>
                      )}
                      {!r.forecast && <p className="text-muted-foreground">Informe a meta{goal === "growth" ? " e o MRR base" : ""}.</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {canEdit && ratios && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="space-y-1">
                  <Label htmlFor="cp-name">Nome do cenário</Label>
                  <Input id="cp-name" className="w-72" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Ex.: Workshop FC 11/2026" />
                </div>
                <Button onClick={save}><Save className="mr-2 h-4 w-4" />Salvar cenário</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Cenários salvos</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Investimento</TableHead>
                <TableHead>Meta</TableHead><TableHead className="text-right">MRR esperado</TableHead><TableHead className="text-right">Vendas esperadas</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {(saved.data || []).length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nenhum cenário salvo.</TableCell></TableRow>}
                {(saved.data || []).map((s: any) => {
                  const exp = s.results?.forward?.find((x: any) => x.k === "esperado")?.f;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{brl(Number(s.investment))}</TableCell>
                      <TableCell>{GOAL_LABEL[s.goal_type as GoalType]}: {num(Number(s.goal_value), 2)}</TableCell>
                      <TableCell className="text-right">{brl(exp?.mrr)}</TableCell>
                      <TableCell className="text-right">{num(exp?.sales, 0)}</TableCell>
                      <TableCell>{canEdit && <Button size="icon" variant="ghost" aria-label="Excluir cenário" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{l}</span>
      <span className={strong ? "font-semibold" : ""}>{v}</span>
    </div>
  );
}
