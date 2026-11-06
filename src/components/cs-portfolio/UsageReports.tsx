import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useProductUsage } from "@/hooks/useProductUsage";
import { PQL_TIER_LABEL, USAGE_TIER_LABEL, USAGE_TIERS } from "@/lib/productUsage";
import { fmtBRL, type CsPortfolioRow } from "@/lib/csPortfolio";

const IE_BANDS = [
  { label: "0–19", min: 0, max: 20 }, { label: "20–39", min: 20, max: 40 }, { label: "40–59", min: 40, max: 60 },
  { label: "60–79", min: 60, max: 80 }, { label: "80–100", min: 80, max: 101 },
];
const PQL_ORDER = ["pql", "quase_qualificado", "em_desenvolvimento", "nao_qualificado"];

function ChartCard({ title, data, dataKey = "count", xKey = "label" }: { title: string; data: any[]; dataKey?: string; xKey?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval={0} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v: number, _n, p: any) => dataKey === "count" ? [`${v} clientes · ${fmtBRL(p.payload.mrr)}`, "Base"] : [v, "IE médio"]} />
            <Bar dataKey={dataKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
              <LabelList dataKey={dataKey} position="top" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function UsageReports({ rows }: { rows: CsPortfolioRow[] }) {
  const usage = useProductUsage();
  const data = useMemo(() => {
    const m = usage.data?.byEmail;
    if (!m) return null;
    const tier = new Map<string, { count: number; mrr: number }>();
    const pql = new Map<string, { count: number; mrr: number }>();
    const ie = IE_BANDS.map((b) => ({ label: b.label, count: 0, mrr: 0 }));
    const plan = new Map<string, { sum: number; n: number }>();
    let matched = 0;
    for (const r of rows) {
      const u = m.get(r.email.toLowerCase());
      const tk = u?.tier || "sem_dado";
      const t = tier.get(tk) ?? { count: 0, mrr: 0 }; t.count++; t.mrr += r.mrr; tier.set(tk, t);
      if (!u) continue;
      matched++;
      if (u.pql_tier) { const p = pql.get(u.pql_tier) ?? { count: 0, mrr: 0 }; p.count++; p.mrr += r.mrr; pql.set(u.pql_tier, p); }
      if (u.ie != null) {
        const i = IE_BANDS.findIndex((b) => u.ie! >= b.min && u.ie! < b.max);
        if (i >= 0) { ie[i].count++; ie[i].mrr += r.mrr; }
        const pk = (u.plano || "—").toUpperCase();
        const pp = plan.get(pk) ?? { sum: 0, n: 0 }; pp.sum += u.ie; pp.n++; plan.set(pk, pp);
      }
    }
    return {
      matched,
      tier: [...USAGE_TIERS, "sem_dado"].map((k) => ({ label: USAGE_TIER_LABEL[k], ...(tier.get(k) ?? { count: 0, mrr: 0 }) })),
      pql: PQL_ORDER.map((k) => ({ label: PQL_TIER_LABEL[k], ...(pql.get(k) ?? { count: 0, mrr: 0 }) })),
      ie,
      plan: [...plan.entries()].map(([label, v]) => ({ label, avg: Math.round(v.sum / v.n) })).sort((a, b) => b.avg - a.avg),
    };
  }, [rows, usage.data]);

  if (usage.isLoading) return null;
  const ref = usage.data?.referenceDate;
  const refFmt = ref ? ref.split("-").reverse().join("/") : null;

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-base font-semibold">Uso do produto (IE e PQL)</h3>
      {!data || !usage.data?.rows.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma planilha de uso importada ainda.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Clientes por Tier de uso" data={data.tier} />
            <ChartCard title="Distribuição de IE (Índice de Engajamento)" data={data.ie} />
            <ChartCard title="Clientes por PQL Tier" data={data.pql} />
            <ChartCard title="IE médio por plano" data={data.plan} dataKey="avg" />
          </div>
          <p className="text-xs text-muted-foreground">
            Dados de uso conforme a planilha importada com referência em {refFmt ?? "—"}. {data.matched} de {rows.length} clientes da carteira filtrada foram encontrados pelo e-mail; os demais aparecem como "Sem dado".
          </p>
        </>
      )}
    </div>
  );
}
