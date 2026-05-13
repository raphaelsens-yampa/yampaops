import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ManagerOnly } from "@/components/ManagerOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_OPTIONS } from "@/lib/salesCampaigns";

export default function SalesCampaignReports() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["sales-campaigns-report"],
    queryFn: async () => {
      const [{ data: campaigns }, { data: contacts }] = await Promise.all([
        supabase.from("sales_campaigns").select("*"),
        supabase.from("sales_campaign_contacts").select("campaign_id, status, mrr_generated"),
      ]);
      const map: Record<string, any> = {};
      for (const c of campaigns || []) {
        map[c.id] = { ...c, base: 0, contacted: 0, replies: 0, conversions: 0, mrr: 0 };
      }
      for (const c of contacts || []) {
        const m = map[c.campaign_id]; if (!m) continue;
        m.base++;
        if (["contatado", "respondeu", "agendado", "convertido"].includes(c.status)) m.contacted++;
        if (["respondeu", "agendado", "convertido"].includes(c.status)) m.replies++;
        if (c.status === "convertido") m.conversions++;
        m.mrr += Number(c.mrr_generated || 0);
      }
      return Object.values(map);
    },
  });

  const rows = (data as any[]) || [];
  const ranked = [...rows].sort((a, b) => b.mrr - a.mrr);

  // Group by channel
  const byChannel = CHANNEL_OPTIONS.map((opt) => {
    const list = rows.filter((r) => r.channel === opt.value);
    return {
      channel: opt.label,
      mrr: list.reduce((s, r) => s + r.mrr, 0),
      conversions: list.reduce((s, r) => s + r.conversions, 0),
    };
  }).filter((c) => c.mrr > 0 || c.conversions > 0);

  return (
    <ManagerOnly>
      <Layout>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/sales-campaigns")}>
              <ArrowLeft className="h-4 w-4 mr-1" />Voltar
            </Button>
            <h1 className="font-heading font-bold text-2xl">Relatórios de Campanhas</h1>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">MRR por canal</CardTitle></CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={byChannel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="channel" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Bar dataKey="mrr" fill="hsl(var(--primary))" name="MRR" />
                  <Bar dataKey="conversions" fill="hsl(var(--secondary))" name="Conversões" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ranking por MRR</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Campanha</TableHead><TableHead>Canal</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Conv. %</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ranked.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Sem dados</TableCell></TableRow>}
                  {ranked.map((r, i) => {
                    const convPct = r.contacted > 0 ? ((r.conversions / r.contacted) * 100).toFixed(1) : "0.0";
                    const roi = Number(r.budget) > 0 ? `${Math.round((r.mrr / Number(r.budget)) * 100)}%` : "—";
                    return (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/sales-campaigns/${r.id}`)}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{CHANNEL_OPTIONS.find((o) => o.value === r.channel)?.label || r.channel}</TableCell>
                        <TableCell className="text-right">{r.base}</TableCell>
                        <TableCell className="text-right">{r.conversions}</TableCell>
                        <TableCell className="text-right">{convPct}%</TableCell>
                        <TableCell className="text-right">R$ {r.mrr.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="text-right">R$ {Number(r.budget).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="text-right">{roi}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ManagerOnly>
  );
}
