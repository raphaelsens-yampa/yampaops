import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SafraSelector } from "@/components/SafraSelector";
import { TagChip } from "@/components/tags/TagChip";
import { useTags, useOpportunityTags } from "@/hooks/useTags";
import { Download, FileBarChart } from "lucide-react";
import { format } from "date-fns";

function startOfMonth(d: Date) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d: Date) { const x = startOfMonth(d); x.setMonth(x.getMonth()+1); return x; }

function downloadCSV(filename: string, rows: any[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = r[h] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [safra, setSafra] = useState<Date>(startOfMonth(new Date()));
  const safraStart = startOfMonth(safra).toISOString();
  const safraEnd = endOfMonth(safra).toISOString();

  const { data: opps = [] } = useQuery({
    queryKey: ["reports-opps", safraStart, safraEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, title, name, company, stage, estimated_mrr, origin, consultant_id, opportunity_created_at, converted_at, closed_at, created_at")
        .gte("opportunity_created_at", safraStart)
        .lt("opportunity_created_at", safraEnd)
        .order("opportunity_created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["reports-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data || [];
    },
  });
  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.full_name]));

  const { data: tags = [] } = useTags();
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const oppIds = opps.map((o: any) => o.id);
  const { data: tagMap = {} } = useOpportunityTags(oppIds);

  // Conversões por vendedor
  const sellerStats = useMemo(() => {
    const m = new Map<string, { name: string; created: number; won: number; mrr: number }>();
    opps.forEach((o: any) => {
      const key = o.consultant_id || "—";
      const cur = m.get(key) || { name: profileMap.get(key) || "—", created: 0, won: 0, mrr: 0 };
      cur.created++;
      if (o.converted_at) { cur.won++; cur.mrr += o.estimated_mrr || 0; }
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.mrr - a.mrr);
  }, [opps, profileMap]);

  // Tag stats
  const tagStats = useMemo(() => {
    const m = new Map<string, { count: number; won: number; mrr: number }>();
    Object.entries(tagMap as Record<string, string[]>).forEach(([oppId, tagIds]) => {
      const opp = opps.find((o: any) => o.id === oppId);
      if (!opp) return;
      tagIds.forEach((tid) => {
        const cur = m.get(tid) || { count: 0, won: 0, mrr: 0 };
        cur.count++;
        if (opp.converted_at) { cur.won++; cur.mrr += opp.estimated_mrr || 0; }
        m.set(tid, cur);
      });
    });
    return Array.from(m.entries()).map(([tid, s]) => ({
      tag: tagsById.get(tid),
      ...s,
      conv: s.count > 0 ? ((s.won / s.count) * 100).toFixed(1) : "0",
    })).filter((r) => r.tag);
  }, [tagMap, opps, tagsById]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <FileBarChart className="h-6 w-6" /> Relatórios
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análise por safra (mês de criação das oportunidades).
            </p>
          </div>
          <SafraSelector value={safra} onChange={setSafra} />
        </div>

        <Tabs defaultValue="opportunities">
          <TabsList>
            <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
            <TabsTrigger value="conversions">Conversões</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="tags">Por Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Oportunidades da safra ({opps.length})</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadCSV(
                  `oportunidades-${format(safra, "yyyy-MM")}.csv`,
                  opps.map((o: any) => ({
                    titulo: o.title || o.name,
                    empresa: o.company || "",
                    etapa: o.stage,
                    mrr: o.estimated_mrr || 0,
                    canal: o.origin,
                    vendedor: profileMap.get(o.consultant_id) || "",
                    criacao: o.opportunity_created_at?.slice(0, 10) || "",
                    conversao: o.converted_at?.slice(0, 10) || "",
                    encerramento: o.closed_at?.slice(0, 10) || "",
                  }))
                )}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Criação</TableHead>
                      <TableHead>Conversão</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opps.map((o: any) => {
                      const ids = (tagMap as Record<string, string[]>)[o.id] || [];
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.title || o.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{o.company}</TableCell>
                          <TableCell className="text-xs">{o.stage}</TableCell>
                          <TableCell className="text-right">R$ {(o.estimated_mrr || 0).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-xs">{profileMap.get(o.consultant_id) || "—"}</TableCell>
                          <TableCell className="text-xs">{o.opportunity_created_at ? format(new Date(o.opportunity_created_at), "dd/MM") : "—"}</TableCell>
                          <TableCell className="text-xs">{o.converted_at ? format(new Date(o.converted_at), "dd/MM") : "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {ids.slice(0, 3).map((tid) => {
                                const t = tagsById.get(tid);
                                return t ? <TagChip key={tid} tag={t} size="xs" /> : null;
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conversões da safra</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Criadas</p>
                    <p className="text-2xl font-bold">{opps.length}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Ganhas</p>
                    <p className="text-2xl font-bold text-success">{opps.filter((o: any) => o.converted_at).length}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Taxa</p>
                    <p className="text-2xl font-bold">
                      {opps.length > 0 ? ((opps.filter((o: any) => o.converted_at).length / opps.length) * 100).toFixed(1) : "0"}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance por vendedor</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Criadas</TableHead>
                      <TableHead className="text-right">Ganhas</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead className="text-right">Conversão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellerStats.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{s.created}</TableCell>
                        <TableCell className="text-right text-success">{s.won}</TableCell>
                        <TableCell className="text-right">R$ {s.mrr.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{s.created > 0 ? ((s.won / s.created) * 100).toFixed(1) : "0"}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tags">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance por tag</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tag</TableHead>
                      <TableHead className="text-right">Oportunidades</TableHead>
                      <TableHead className="text-right">Ganhas</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead className="text-right">Conversão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tagStats.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell><TagChip tag={s.tag!} /></TableCell>
                        <TableCell className="text-right">{s.count}</TableCell>
                        <TableCell className="text-right text-success">{s.won}</TableCell>
                        <TableCell className="text-right">R$ {s.mrr.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{s.conv}%</TableCell>
                      </TableRow>
                    ))}
                    {tagStats.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                          Nenhuma oportunidade da safra possui tags.
                        </TableCell>
                      </TableRow>
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
