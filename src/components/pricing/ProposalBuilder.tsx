import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, FileDown, Plus, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { createPricingCtx, fmtBRL } from "@/lib/pricing/engine";
import { LINE_LABEL } from "@/lib/pricing/types";
import type { MarkupLineKey, PricingVersionRow, Service } from "@/lib/pricing/types";

interface BuilderItem {
  service_id: string;
  name: string;
  line: MarkupLineKey;
  contract_months: number;
  qty: number;
  unit_monthly: number; // editable override (monthly)
  unit_total: number;   // computed = unit_monthly * contract_months
  cost_monthly: number;
  ideal_monthly: number;
  note?: string;
}

interface Props {
  version: PricingVersionRow;
  seedService?: Service | null;
  onSeedConsumed?: () => void;
  onSaved?: () => void;
}

export function ProposalBuilder({ version, seedService, onSeedConsumed, onSaved }: Props) {
  const qc = useQueryClient();
  const snap = version.snapshot;
  const ctx = useMemo(() => createPricingCtx(snap), [snap]);

  const [client, setClient] = useState({ name: "", doc: "", email: "", phone: "" });
  const [summary, setSummary] = useState("");
  const [terms, setTerms] = useState(
    "Pagamento mensal recorrente via cartão de crédito ou boleto.\nContrato com fidelidade conforme prazo selecionado.",
  );
  const [validUntil, setValidUntil] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [oppId, setOppId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState<"all" | MarkupLineKey>("all");
  const [saving, setSaving] = useState(false);

  const { data: opportunities = [] } = useQuery({
    queryKey: ["proposal-opps"],
    queryFn: async () => {
      const { data } = await supabase
        .from("opportunities")
        .select("id, title")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const makeItem = (svc: Service): BuilderItem => {
    const c = ctx.serviceCalc(svc);
    return {
      service_id: svc.id,
      name: svc.name,
      line: svc.line,
      contract_months: svc.contract_months,
      qty: 1,
      unit_monthly: c.practiced_monthly,
      unit_total: c.practiced_monthly * svc.contract_months,
      cost_monthly: c.cost_monthly,
      ideal_monthly: c.ideal_price_monthly,
    };
  };

  useEffect(() => {
    if (seedService) {
      setItems((prev) => [...prev, makeItem(seedService)]);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedService]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snap.services.filter(
      (s) =>
        s.active &&
        (lineFilter === "all" || s.line === lineFilter) &&
        (q === "" || s.name.toLowerCase().includes(q)),
    );
  }, [snap.services, search, lineFilter]);

  const addService = (svc: Service) => setItems((prev) => [...prev, makeItem(svc)]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const patchItem = (idx: number, p: Partial<BuilderItem>) =>
    setItems((prev) =>
      prev.map((x, i) => {
        if (i !== idx) return x;
        const next = { ...x, ...p };
        // keep total in sync with monthly + months
        if (p.unit_monthly !== undefined || p.contract_months !== undefined) {
          next.unit_total = next.unit_monthly * next.contract_months;
        }
        return next;
      }),
    );

  const totals = useMemo(() => {
    const subMonthly = items.reduce((s, i) => s + i.unit_monthly * i.qty, 0);
    const subTotal = items.reduce((s, i) => s + i.unit_total * i.qty, 0);
    const factor = 1 - (discountPct || 0) / 100;
    return {
      subMonthly,
      subTotal,
      monthly: subMonthly * factor,
      total: subTotal * factor,
      saving: subTotal - subTotal * factor,
    };
  }, [items, discountPct]);

  const reset = () => {
    setClient({ name: "", doc: "", email: "", phone: "" });
    setSummary("");
    setValidUntil("");
    setDiscountPct(0);
    setItems([]);
    setOppId(null);
  };

  const persist = async (status: "draft" | "sent"): Promise<string | null> => {
    if (!client.name.trim()) {
      toast({ title: "Informe o nome do cliente", variant: "destructive" });
      return null;
    }
    if (items.length === 0) {
      toast({ title: "Adicione ao menos 1 serviço", variant: "destructive" });
      return null;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("pricing_proposals")
      .insert({
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
        discount_pct: discountPct,
        total_annual: totals.total,
        total_monthly: totals.monthly,
        status,
        created_by: u.user?.id,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return null;
    }
    qc.invalidateQueries({ queryKey: ["pricing-proposals"] });
    return data?.id ?? null;
  };

  const saveDraft = async () => {
    const id = await persist("draft");
    if (id) {
      toast({ title: "Rascunho salvo" });
      reset();
      onSaved?.();
    }
  };

  const generatePdf = async () => {
    const id = await persist("draft");
    if (!id) return;
    const { data, error } = await supabase.functions.invoke("pricing-proposal-pdf", {
      body: { proposal_id: id },
    });
    if (error) {
      toast({ title: "Erro PDF", description: error.message, variant: "destructive" });
      return;
    }
    const blob = new Blob(
      [Uint8Array.from(atob((data as any).pdf_base64), (c) => c.charCodeAt(0))],
      { type: "application/pdf" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposta-${client.name.replace(/\s+/g, "_")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "PDF gerado" });
  };

  const itemStatus = (it: BuilderItem): { label: string; variant: "default" | "secondary" | "destructive" } => {
    if (it.unit_monthly < it.cost_monthly) return { label: "Prejuízo", variant: "destructive" };
    if (it.unit_monthly < it.ideal_monthly * 0.95) return { label: "Abaixo do ideal", variant: "secondary" };
    return { label: "OK", variant: "default" };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Builder column */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
            </div>
            <div>
              <Label>CNPJ/CPF</Label>
              <Input value={client.doc} onChange={(e) => setClient({ ...client, doc: e.target.value })} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Oportunidade vinculada</Label>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
            <div className="flex gap-2 mt-2">
              <Input placeholder="Buscar serviço…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={lineFilter} onValueChange={(v) => setLineFilter(v as any)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as linhas</SelectItem>
                  <SelectItem value="premium">{LINE_LABEL.premium}</SelectItem>
                  <SelectItem value="gold">{LINE_LABEL.gold}</SelectItem>
                  <SelectItem value="prata">{LINE_LABEL.prata}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="w-20">Linha</TableHead>
                    <TableHead className="w-16 text-right">Prazo</TableHead>
                    <TableHead className="text-right">Praticado /mês</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCatalog.map((s) => {
                    const c = ctx.serviceCalc(s);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-xs">{LINE_LABEL[s.line]}</TableCell>
                        <TableCell className="text-right">{s.contract_months}m</TableCell>
                        <TableCell className="text-right">{fmtBRL(c.practiced_monthly)}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => addService(s)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredCatalog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                        Nenhum serviço encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens da proposta</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Adicione serviços a partir do catálogo acima.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((it, idx) => {
                  const st = itemStatus(it);
                  return (
                    <div key={idx} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-muted-foreground">{LINE_LABEL[it.line]}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={st.variant}>{st.label}</Badge>
                          <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">Qtd</Label>
                          <Input
                            type="number"
                            value={it.qty}
                            onChange={(e) => patchItem(idx, { qty: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Prazo (m)</Label>
                          <Input
                            type="number"
                            value={it.contract_months}
                            onChange={(e) =>
                              patchItem(idx, { contract_months: Number(e.target.value) || 1 })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Preço /mês</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={it.unit_monthly}
                            onChange={(e) => patchItem(idx, { unit_monthly: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Total contrato</Label>
                          <Input value={fmtBRL(it.unit_total * it.qty)} disabled />
                        </div>
                      </div>
                      {st.variant === "destructive" && (
                        <div className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Preço abaixo do custo ({fmtBRL(it.cost_monthly)}/mês).
                        </div>
                      )}
                      <div>
                        <Label className="text-xs">Observação (opcional)</Label>
                        <Input
                          value={it.note ?? ""}
                          onChange={(e) => patchItem(idx, { note: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo e condições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desconto global (%)</Label>
                <Input
                  type="number"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Válida até</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Resumo executivo</Label>
              <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div>
              <Label>Condições de pagamento</Label>
              <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview column */}
      <div className="space-y-4">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle>Pré-visualização</CardTitle>
            <p className="text-sm text-muted-foreground">
              {client.name || "Cliente sem nome"} · {items.length} ite{items.length === 1 ? "m" : "ns"}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal /mês</span>
                <span>{fmtBRL(totals.subMonthly)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal contrato</span>
                <span>{fmtBRL(totals.subTotal)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>Desconto ({discountPct}%)</span>
                  <span>− {fmtBRL(totals.saving)}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between text-base font-bold">
                  <span>Total /mês</span>
                  <span>{fmtBRL(totals.monthly)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-primary">
                  <span>Total contrato</span>
                  <span>{fmtBRL(totals.total)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="w-full" onClick={generatePdf} disabled={saving}>
                <FileDown className="h-4 w-4 mr-1" /> Gerar PDF
              </Button>
              <Button className="w-full" variant="outline" onClick={saveDraft} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> Salvar rascunho
              </Button>
              <Button className="w-full" variant="ghost" onClick={reset} disabled={saving}>
                Limpar
              </Button>
            </div>

            {items.some((i) => i.unit_monthly < i.cost_monthly) && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                Há itens precificados abaixo do custo. Revise antes de enviar.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
