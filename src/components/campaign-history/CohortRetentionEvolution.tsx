import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildCohortMatrix, type CohortContact, type CohortResult, type CohortRow } from "@/lib/campaignCohort";
import { campaignLabel, type HistoryCampaign } from "@/lib/campaignHistory";

const OFFSETS = [0, 1, 3, 6, 12];

/** Retenção ponderada do cohort da campanha no offset informado (só cohorts com o mês disponível). */
function retentionAtOffset(rows: CohortRow[], offset: number) {
  const matrix = buildCohortMatrix(rows);
  let active = 0;
  let size = 0;
  for (const r of matrix) {
    const cell = r.cells[offset];
    if (!cell) continue;
    active += cell.active;
    size += cell.size;
  }
  if (!size) return { pct: null as number | null, active: 0, size: 0 };
  return { pct: (active / size) * 100, active, size };
}

export function CohortRetentionEvolution({ campaigns }: { campaigns: HistoryCampaign[] }) {
  const [offset, setOffset] = useState(1);

  const cohortQ = useQuery({
    queryKey: ["cohort-evolution-all"],
    queryFn: async () => {
      const [contactsRes, resultsRes] = await Promise.all([
        supabase
          .from("campaign_cohort_contacts")
          .select("id, campaign_id, email, email_norm, name, offer, activated_at"),
        supabase.from("campaign_cohort_results").select("*"),
      ]);
      if (contactsRes.error) throw contactsRes.error;
      if (resultsRes.error) throw resultsRes.error;

      const results = new Map<string, CohortResult>();
      for (const r of (resultsRes.data ?? []) as unknown as CohortResult[]) results.set(r.contact_id, r);

      const byCampaign = new Map<string, CohortRow[]>();
      for (const c of (contactsRes.data ?? []) as unknown as CohortContact[]) {
        const list = byCampaign.get(c.campaign_id) ?? [];
        list.push({ ...c, result: results.get(c.id) ?? null });
        byCampaign.set(c.campaign_id, list);
      }
      return byCampaign;
    },
  });

  const data = useMemo(() => {
    const byCampaign = cohortQ.data;
    if (!byCampaign) return [];
    return campaigns
      .map((c) => {
        const rows = byCampaign.get(c.id) ?? [];
        const { pct, active, size } = retentionAtOffset(rows, offset);
        return { name: campaignLabel(c), retencao: pct, ativos: active, base: size };
      })
      .filter((d) => d.base > 0);
  }, [campaigns, cohortQ.data, offset]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Retenção do cohort por campanha</CardTitle>
        <Select value={String(offset)} onValueChange={(v) => setOffset(Number(v))}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OFFSETS.map((o) => (
              <SelectItem key={o} value={String(o)}>M{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {cohortQ.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando cohort…</p>
        ) : !data.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma campanha com cohort calculado para M{offset}. Importe a lista e recalcule o cohort na aba Cohort.
          </p>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  width={60}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(v: any, name: any, item: any) =>
                    item?.dataKey === "retencao"
                      ? [`${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, name]
                      : [Number(v).toLocaleString("pt-BR"), name]
                  }
                />
                <Legend />
                <Bar
                  yAxisId="right"
                  dataKey="base"
                  name={`Base do cohort (M${offset})`}
                  fill="hsl(var(--chart-logo-soft))"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="retencao"
                  name={`Retenção M${offset}`}
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
