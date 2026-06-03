import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FileDown, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fmtBRL, serviceCalc } from "@/lib/pricing/engine";
import type { PricingVersionRow, Service } from "@/lib/pricing/types";

interface Props {
  version: PricingVersionRow;
}

interface ProposalItem {
  service_id: string;
  name: string;
  contract_months: number;
  unit_total: number;
  unit_monthly: number;
  qty: number;
}

export function ProposalsManager({ version }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState({ name: "", doc: "", email: "", phone: "" });
  const [summary, setSummary] = useState("");
  const [terms, setTerms] = useState("Pagamento mensal recorrente via cartão de crédito ou boleto.\nContrato com fidelidade conforme prazo selecionado.");
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [oppId, setOppId] = useState<string | null>(null);

  const { data: proposals = [] } = useQuery({
    queryKey: ["pricing-proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_proposals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["proposal-opps"],
    queryFn: async () => {
      const { data } = await supabase.from("opportunities").select("id, title").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const reset = () => {
    setClient({ name: "", doc: "", email: "", phone: "" });
    setSummary(""); setValidUntil(""); setDiscount(0); setItems([]); setOppId(null);
  };

  const addItem = (svc: Service) => {
    const c = serviceCalc(version.snapshot, svc);
    setItems((prev) => [
      ...prev,
      {
        service_id: svc.id,
        name: svc.name,
        contract_months: svc.contract_months,
        unit_total: svc.practiced_price,
        unit_monthly: c.practiced_monthly,
        qty: 1,
      },
    ]);
  };

  const totals = useMemo(() => {
    const subtotal_total = items.reduce((s, i) => s + i.unit_total * i.qty, 0);
    const subtotal_monthly = items.reduce((s, i) => s + i.unit_monthly * i.qty, 0);
    const discount_factor = 1 - (discount || 0) / 100;
    return {
      subtotal_total,
      subtotal_monthly,
      total: subtotal_total * discount_factor,
      monthly: subtotal_monthly * discount_factor,
    };
  }, [items, discount]);

  const save = async () => {
    if (!client.name.trim() || items.length === 0) {
      toast({ title: "Preencha cliente e adicione ao menos 1 serviço", variant: "destructive" });
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("pricing_proposals").insert({
      version_id: version.id,
      opportunity_id: oppId,
      client_name: client.name,
      client_doc: client.doc || null,
      client_email: client.email || null,
      client_phone: client.phone || null,
      executive_summary: summary || null,
      payment_terms: terms || null,
      valid_until: validUntil || null,
      items: items as any,
      discount_pct: discount,
      total_annual: totals.total,
      total_monthly: totals.monthly,
      status: "draft",
      created_by: u.user?.id,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Proposta criada" });
    setOpen(false); reset();
    qc.invalidateQueries({ queryKey: ["pricing-proposals"] });
  };

  const downloadPdf = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("pricing-proposal-pdf", { body: { proposal_id: id } });
    if (error) { toast({ title: "Erro PDF", description: error.message, variant: "destructive" }); return; }
    const blob = new Blob([Uint8Array.from(atob((data as any).pdf_base64), (c) => c.charCodeAt(0))], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `proposta-${id.slice(0,8)}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const del = async (id: string) => {
    if (!confirm("Excluir proposta?")) return;
    const { error } = await supabase.from("pricing_proposals").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["pricing-proposals"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Propostas Comerciais</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Geradas a partir da versão "{version.name}". O PDF pode ser baixado a qualquer momento.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Nova proposta</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader><DialogTitle>Nova Proposta Comercial</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome do cliente *</Label><Input value={client.name} onChange={(e) => setClient({...client, name: e.target.value})} /></div>
              <div><Label>CNPJ/CPF</Label><Input value={client.doc} onChange={(e) => setClient({...client, doc: e.target.value})} /></div>
              <div><Label>E-mail</Label><Input value={client.email} onChange={(e) => setClient({...client, email: e.target.value})} /></div>
              <div><Label>Telefone</Label><Input value={client.phone} onChange={(e) => setClient({...client, phone: e.target.value})} /></div>
              <div className="col-span-2">
                <Label>Vincular a Oportunidade (opcional)</Label>
                <Select value={oppId ?? "none"} onValueChange={(v) => setOppId(v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {opportunities.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Resumo executivo</Label>
                <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
            </div>

            <div className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Serviços</h4>
                <Select onValueChange={(v) => { const svc = version.snapshot.services.find((s) => s.id === v); if (svc) addItem(svc); }}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Adicionar serviço…" /></SelectTrigger>
                  <SelectContent>
                    {version.snapshot.services.filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="w-16">Qty</TableHead>
                    <TableHead className="text-right w-32">Mensal</TableHead>
                    <TableHead className="text-right w-32">Total contrato</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{it.name}<div className="text-xs text-muted-foreground">{it.contract_months}m</div></TableCell>
                      <TableCell>
                        <Input type="number" value={it.qty}
                          onChange={(e) => setItems(items.map((x,i) => i===idx ? {...x, qty: Number(e.target.value)} : x))}
                        />
                      </TableCell>
                      <TableCell className="text-right">{fmtBRL(it.unit_monthly * it.qty)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(it.unit_total * it.qty)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_,i) => i !== idx))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label>Desconto (%)</Label><Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
              <div><Label>Válida até</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
              <div className="text-right space-y-1 pt-5">
                <div className="text-sm text-muted-foreground">Mensal: <span className="font-bold">{fmtBRL(totals.monthly)}</span></div>
                <div className="text-lg font-bold">Total: {fmtBRL(totals.total)}</div>
              </div>
            </div>
            <div>
              <Label>Condições</Label>
              <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>

            <DialogFooter><Button onClick={save}>Salvar proposta</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Mensal</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Criada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposals.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.client_name}</div>
                  <div className="text-xs text-muted-foreground">{p.client_doc}</div>
                </TableCell>
                <TableCell><Badge variant={p.status === "accepted" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">{fmtBRL(p.total_monthly)}</TableCell>
                <TableCell className="text-right">{fmtBRL(p.total_annual)}</TableCell>
                <TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(p.id)}><FileDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {proposals.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma proposta ainda.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
