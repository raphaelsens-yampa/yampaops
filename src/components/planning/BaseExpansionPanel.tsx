import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_TRACKS, SCENARIOS, filterByOrigin, planSummary, projectTrack, rampPlan, eligibleClients, normPlan, excludeInternal, newUpsellTrack,
  type BaseClient, type CatalogService, type ExpansionTrack, type OriginFilter, type Scenario,
} from "@/lib/baseExpansion";

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const SC_LABEL: Record<Scenario, string> = { pessimista: "Pessimista", realista: "Realista", otimista: "Otimista" };

function useBase() {
  return useQuery({
    queryKey: ["base-expansion-clients"],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<BaseClient>(() =>
        supabase.from("cs_portfolio").select("email, company_name, plano, mrr, tenure_days, origem_cliente")
          .eq("is_active", true).order("email") as any);
      if (error) throw new Error(error);
      return data;
    },
  });
}

function useCatalog() {
  return useQuery({
    queryKey: ["base-expansion-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pricing_versions").select("snapshot").eq("is_active", true).maybeSingle();
      if (error) throw error;
      const products = ((data?.snapshot as any)?.products || []) as any[];
      return products
        .map((p) => ({ nome: String(p.nome), preco_mensal: Number(p.preco_mensal) || 0, custo: Number(p.custo) || 0, meses: Number(p.meses) || 1 }))
        .filter((p) => /bpo|time financeiro|consult/i.test(p.nome)) as CatalogService[];
    },
  });
}

export function BaseExpansionPanel() {
  const base = useBase();
  const catalog = useCatalog();
  const [origin, setOrigin] = useState<OriginFilter>("todas");
  const [tracks, setTracks] = useState<ExpansionTrack[]>(DEFAULT_TRACKS);
  const [scenario, setScenario] = useState<Scenario>("realista");
  const [rampMonths, setRampMonths] = useState(6);

  const clients = useMemo(() => filterByOrigin(excludeInternal(base.data || []), origin), [base.data, origin]);
  const plans = useMemo(() => planSummary(clients), [clients]);
  const cat = catalog.data || [];
  const projections = useMemo(() => tracks.map((t) => projectTrack(clients, t, cat)), [tracks, clients, cat]);

  const total = (s: Scenario) => projections.reduce(
    (acc, p) => ({ contratos: acc.contratos + p.byScenario[s].contratos, mrr: acc.mrr + p.byScenario[s].mrr, margem: acc.margem + p.byScenario[s].margemMensal }),
    { contratos: 0, mrr: 0, margem: 0 });
  const baseMrr = plans.reduce((s, p) => s + p.mrr, 0);

  const update = (key: string, patch: Partial<ExpansionTrack>) =>
    setTracks((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const opportunities = useMemo(() => {
    const seen = new Map<string, { c: BaseClient; frentes: string[] }>();
    for (const t of tracks) for (const c of eligibleClients(clients, t)) {
      const r = seen.get(c.email) || { c, frentes: [] };
      r.frentes.push(t.label);
      seen.set(c.email, r);
    }
    return [...seen.values()].sort((a, b) => (b.c.tenure_days ?? 0) - (a.c.tenure_days ?? 0) || b.c.mrr - a.c.mrr);
  }, [tracks, clients]);

  if (base.isLoading || catalog.isLoading)
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Carregando base...</CardContent></Card>;
  if (base.error || catalog.error)
    return <Card><CardContent className="py-12 text-center text-sm text-destructive">Não foi possível carregar a base ou o catálogo de serviços.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Origem:</span>
        {(["todas", "yampa", "4blue"] as OriginFilter[]).map((o) => (
          <Button key={o} size="sm" variant={origin === o ? "default" : "outline"} onClick={() => setOrigin(o)}>
            {o === "todas" ? "Todas" : o === "yampa" ? "Yampa" : "4blue"}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-4">Cenário da rampa:</span>
        {SCENARIOS.map((s) => (
          <Button key={s} size="sm" variant={scenario === s ? "default" : "outline"} onClick={() => setScenario(s)}>{SC_LABEL[s]}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setTracks(DEFAULT_TRACKS)}>Restaurar premissas</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SCENARIOS.map((s) => {
          const t = total(s);
          return (
            <Card key={s} className={scenario === s ? "border-primary" : ""}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{SC_LABEL[s]}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="text-2xl font-heading font-bold">+{brl(t.mrr)}<span className="text-sm font-normal text-muted-foreground"> /mês</span></div>
                <div className="text-muted-foreground">{t.contratos} contratos · ARR {brl(t.mrr * 12)}</div>
                <div className="text-muted-foreground">
                  {baseMrr > 0 ? `+${((t.mrr / baseMrr) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% sobre o MRR da base` : ""}
                  {" · "}Margem bruta {brl(t.margem)}/mês
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Base ativa por plano ({clients.length} clientes · {brl(baseMrr)})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1">Plano</th><th className="text-right">Clientes</th><th className="text-right">MRR</th><th className="text-right">Ticket médio</th></tr></thead>
            <tbody>{plans.map((p) => (
              <tr key={p.plano} className="border-t"><td className="py-1">{p.plano}</td><td className="text-right">{p.clientes}</td><td className="text-right">{brl(p.mrr)}</td><td className="text-right">{brl(p.ticket)}</td></tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Premissas por frente</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setTracks((ts) => {
            const n = ts.filter((x) => x.kind === "upsell").length + 1;
            const idx = ts.map((x) => x.kind).lastIndexOf("upsell");
            const copy = [...ts]; copy.splice(idx + 1, 0, newUpsellTrack(n)); return copy;
          })}>+ Adicionar bloco de upsell</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {tracks.map((t, i) => {
            const p = projections[i];
            return (
              <div key={t.key} className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    {t.kind === "upsell"
                      ? <Input className="h-8 w-56" value={t.label} onChange={(e) => update(t.key, { label: e.target.value })} aria-label="Nome do bloco de upsell" />
                      : t.label}
                    <Badge variant="outline">{t.kind === "upsell" ? "Upsell" : "Cross-sell"}</Badge>
                    {t.kind === "upsell" && tracks.filter((x) => x.kind === "upsell").length > 1 && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setTracks((ts) => ts.filter((x) => x.key !== t.key))}>Remover</Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.elegiveis} elegíveis · ticket adicional {brl(p.ticket)}/mês</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {plans.map((pl) => {
                    const on = t.eligiblePlans.map(normPlan).includes(pl.plano);
                    return (
                      <Button key={pl.plano} size="sm" variant={on ? "secondary" : "outline"} className="h-7 text-xs"
                        onClick={() => update(t.key, { eligiblePlans: on ? t.eligiblePlans.filter((x) => normPlan(x) !== pl.plano) : [...t.eligiblePlans, pl.plano] })}>
                        {pl.plano}
                      </Button>
                    );
                  })}
                </div>
                <div className="grid gap-3 md:grid-cols-5 items-end">
                  <label className="text-xs text-muted-foreground space-y-1">Tempo de casa mín. (dias)
                    <Input type="number" value={t.minTenureDays} onChange={(e) => update(t.key, { minTenureDays: Number(e.target.value) || 0 })} />
                  </label>
                  {t.kind === "cross_sell" ? (
                    <label className="text-xs text-muted-foreground space-y-1 md:col-span-1">Serviço do catálogo
                      <Select value={t.serviceName} onValueChange={(v) => update(t.key, { serviceName: v })}>
                        <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                        <SelectContent>{cat.map((s) => <SelectItem key={s.nome} value={s.nome}>{s.nome} · {brl(s.preco_mensal)}</SelectItem>)}</SelectContent>
                      </Select>
                    </label>
                  ) : (
                    <label className="text-xs text-muted-foreground space-y-1">Plano destino
                      <Select value={t.targetPlan} onValueChange={(v) => update(t.key, { targetPlan: v })}>
                        <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                        <SelectContent>{plans.map((pl) => <SelectItem key={pl.plano} value={pl.plano}>{pl.plano} · {brl(pl.ticket)}</SelectItem>)}</SelectContent>
                      </Select>
                    </label>
                  )}
                  {SCENARIOS.map((s) => (
                    <label key={s} className="text-xs text-muted-foreground space-y-1">Adesão {SC_LABEL[s]} (%)
                      <Input type="number" step="0.5" value={t.adoptionPct[s]}
                        onChange={(e) => update(t.key, { adoptionPct: { ...t.adoptionPct, [s]: Number(e.target.value) || 0 } })} />
                      <span className="block">{p.byScenario[s].contratos} contratos · {brl(p.byScenario[s].mrr)}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Rampa comercial — cenário {SC_LABEL[scenario]}</CardTitle>
          <div className="flex gap-1">{[3, 6, 12].map((m) => (
            <Button key={m} size="sm" variant={rampMonths === m ? "default" : "outline"} onClick={() => setRampMonths(m)}>{m} meses</Button>
          ))}</div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1">Frente</th>
              {Array.from({ length: rampMonths }, (_, i) => <th key={i} className="text-right">M{i + 1}</th>)}</tr></thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.key} className="border-t"><td className="py-1">{p.label}</td>
                  {rampPlan(p.byScenario[scenario].contratos, p.ticket, rampMonths).map((m) => <td key={m.mes} className="text-right">{m.contratos}</td>)}</tr>
              ))}
              <tr className="border-t font-medium"><td className="py-1">MRR acumulado</td>
                {Array.from({ length: rampMonths }, (_, i) => (
                  <td key={i} className="text-right">{brl(projections.reduce((s, p) => s + rampPlan(p.byScenario[scenario].contratos, p.ticket, rampMonths)[i].mrrAcumulado, 0))}</td>
                ))}</tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Oportunidades na base ({opportunities.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground sticky top-0 bg-card"><tr className="text-left"><th className="py-1">Cliente</th><th>Plano</th><th className="text-right">MRR</th><th className="text-right">Dias de casa</th><th>Frentes</th></tr></thead>
            <tbody>{opportunities.slice(0, 300).map(({ c, frentes }) => (
              <tr key={c.email} className="border-t"><td className="py-1">{c.company_name || c.email}</td><td>{normPlan(c.plano)}</td>
                <td className="text-right">{brl(c.mrr)}</td><td className="text-right">{c.tenure_days ?? "—"}</td><td className="text-xs">{frentes.join(" · ")}</td></tr>
            ))}</tbody>
          </table>
          {opportunities.length > 300 && <p className="text-xs text-muted-foreground mt-2">Mostrando os 300 clientes com mais tempo de casa.</p>}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Base: Carteira de CS (clientes ativos). Preços e custos: versão ativa da Precificação. Margem bruta = preço − custo de entrega mensal, antes de impostos e comissões.
      </p>
    </div>
  );
}
