import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { ManagerOnly } from "@/components/ManagerOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Target as TargetIcon, TrendingUp, DollarSign, FileBarChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CHANNEL_OPTIONS, STATUS_OPTIONS, mergeCampaignProgress, statusBadgeClass, sumSnapshotMetrics } from "@/lib/salesCampaigns";

function CreateCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", channel: "outros", segment: "",
    status: "planejada", start_date: "", end_date: "",
    budget: "0", target_contacted: "0", target_replies: "0",
    target_conversions: "0", target_mrr: "0",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("sales_campaigns").insert({
      name: form.name.trim(),
      description: form.description || null,
      channel: form.channel,
      segment: form.segment || null,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget: Number(form.budget) || 0,
      target_contacted: Number(form.target_contacted) || 0,
      target_replies: Number(form.target_replies) || 0,
      target_conversions: Number(form.target_conversions) || 0,
      target_mrr: Number(form.target_mrr) || 0,
      created_by: user?.id,
      owner_id: user?.id,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Campanha criada" });
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Nova campanha</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
          </div>
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Canal</Label>
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Segmento</Label><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} /></div>
          <div><Label>Orçamento (R$)</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
          <div><Label>Início</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div><Label>Término</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          <div><Label>Meta contatados</Label><Input type="number" value={form.target_contacted} onChange={(e) => setForm({ ...form, target_contacted: e.target.value })} /></div>
          <div><Label>Meta respostas</Label><Input type="number" value={form.target_replies} onChange={(e) => setForm({ ...form, target_replies: e.target.value })} /></div>
          <div><Label>Meta conversões</Label><Input type="number" value={form.target_conversions} onChange={(e) => setForm({ ...form, target_conversions: e.target.value })} /></div>
          <div><Label>Meta MRR (R$)</Label><Input type="number" value={form.target_mrr} onChange={(e) => setForm({ ...form, target_mrr: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesCampaigns() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["sales-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Aggregates per campaign
  const { data: aggregates = {} } = useQuery({
    queryKey: ["sales-campaigns-aggregates", campaigns.map((c: any) => c.id).join(",")],
    enabled: campaigns.length > 0,
    queryFn: async () => {
      const ids = campaigns.map((c: any) => c.id);
      const { data: contactsAgg } = await supabase
        .from("sales_campaign_contacts")
        .select("campaign_id, status, mrr_generated")
        .in("campaign_id", ids);
      const map: Record<string, { base: number; contacted: number; replies: number; conversions: number; mrr: number }> = {};
      for (const id of ids) map[id] = { base: 0, contacted: 0, replies: 0, conversions: 0, mrr: 0 };
      for (const c of contactsAgg || []) {
        const m = map[c.campaign_id];
        if (!m) continue;
        m.base++;
        if (["contatado", "respondeu", "agendado", "convertido"].includes(c.status)) m.contacted++;
        if (["respondeu", "agendado", "convertido"].includes(c.status)) m.replies++;
        if (c.status === "convertido") m.conversions++;
        m.mrr += Number(c.mrr_generated || 0);
      }
      return map;
    },
  });

  // Realtime: refresh list + aggregates when campaigns/contacts/snapshots change
  useEffect(() => {
    const channel = supabase
      .channel("sales-campaigns-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_campaigns" }, () => {
        qc.invalidateQueries({ queryKey: ["sales-campaigns"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_campaign_contacts" }, () => {
        qc.invalidateQueries({ queryKey: ["sales-campaigns-aggregates"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_campaign_snapshots" }, () => {
        qc.invalidateQueries({ queryKey: ["sales-campaigns-aggregates"] });
        qc.invalidateQueries({ queryKey: ["sales-campaigns-snapshot-totals"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Snapshots agregados por campanha — soma a evolução registrada e concilia com a base atual
  const { data: snapshotTotals = {} } = useQuery({
    queryKey: ["sales-campaigns-snapshot-totals", campaigns.map((c: any) => c.id).join(",")],
    enabled: campaigns.length > 0,
    queryFn: async () => {
      const ids = campaigns.map((c: any) => c.id);
      const { data } = await supabase
        .from("sales_campaign_snapshots")
        .select("campaign_id, contacted, replies, meetings, conversions, mrr_generated")
        .in("campaign_id", ids);
      const grouped: Record<string, any[]> = {};
      for (const snapshot of data || []) {
        grouped[snapshot.campaign_id] = grouped[snapshot.campaign_id] || [];
        grouped[snapshot.campaign_id].push(snapshot);
      }
      const map: Record<string, any> = {};
      for (const id of ids) {
        map[id] = sumSnapshotMetrics(grouped[id] || []);
      }
      return map;
    },
  });

  const filtered = campaigns.filter((c: any) => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Effective aggregate per campaign: usa o melhor valor entre base atual e evolução acumulada
  const effective = (id: string) => {
    const a = (aggregates as any)[id] || { base: 0, contacted: 0, replies: 0, conversions: 0, mrr: 0 };
    const s = (snapshotTotals as any)[id];
    return mergeCampaignProgress(a, s);
  };

  const totalActive = campaigns.filter((c: any) => c.status === "ativa").length;
  const totalBase = campaigns.reduce((sum: number, c: any) => sum + effective(c.id).base, 0);
  const totalConv = campaigns.reduce((sum: number, c: any) => sum + effective(c.id).conversions, 0);
  const totalMrr = campaigns.reduce((sum: number, c: any) => sum + effective(c.id).mrr, 0);

  return (
    <ManagerOnly>
      <Layout>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="font-heading font-bold text-2xl flex items-center gap-2">
                <Megaphone className="h-6 w-6 text-primary" /> Campanhas de Sales
              </h1>
              <p className="text-sm text-muted-foreground">Gerencie bases, evolução e ROI das campanhas de prospecção.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate("/sales-campaigns/reports")}>
                <FileBarChart className="h-4 w-4 mr-2" />Relatórios
              </Button>
              <CreateCampaignDialog onCreated={() => qc.invalidateQueries({ queryKey: ["sales-campaigns"] })} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<Megaphone className="h-4 w-4" />} label="Campanhas ativas" value={totalActive} />
            <KpiCard icon={<TargetIcon className="h-4 w-4" />} label="Base total" value={totalBase.toLocaleString("pt-BR")} />
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Conversões" value={totalConv} />
            <KpiCard icon={<DollarSign className="h-4 w-4" />} label="MRR gerado" value={`R$ ${totalMrr.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campanhas</CardTitle>
              <CardDescription>{filtered.length} de {campaigns.length} campanhas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterChannel} onValueChange={setFilterChannel}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos canais</SelectItem>
                    {CHANNEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Contatados</TableHead>
                      <TableHead className="text-right">Respostas</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead className="text-right">% Meta MRR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>}
                    {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Nenhuma campanha</TableCell></TableRow>}
                    {filtered.map((c: any) => {
                      const agg = effective(c.id);
                      const pct = c.target_mrr > 0 ? Math.round((agg.mrr / Number(c.target_mrr)) * 100) : 0;
                      return (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/sales-campaigns/${c.id}`)}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{CHANNEL_OPTIONS.find((o) => o.value === c.channel)?.label || c.channel}</TableCell>
                          <TableCell><Badge className={statusBadgeClass(c.status)}>{STATUS_OPTIONS.find((o) => o.value === c.status)?.label || c.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.start_date ? new Date(c.start_date).toLocaleDateString("pt-BR") : "-"} → {c.end_date ? new Date(c.end_date).toLocaleDateString("pt-BR") : "-"}
                          </TableCell>
                          <TableCell className="text-right">{agg.base.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right">{agg.contacted}</TableCell>
                          <TableCell className="text-right">{agg.replies}</TableCell>
                          <TableCell className="text-right">{agg.conversions}</TableCell>
                          <TableCell className="text-right">R$ {agg.mrr.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className="text-right">{pct}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    </ManagerOnly>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-heading font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
