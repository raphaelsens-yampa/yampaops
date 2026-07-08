import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BRL, PAYMENT_TYPE_LABEL, parseDateOnly, type CommissionReference, type PriceMapEntry, type PaymentType } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";
import { MapPin, Plus, Pencil, Lock, Unlock, Zap, FileUp, User, Copy, Download, X } from "lucide-react";
import { MapPriceDialog } from "./MapPriceDialog";
import { ManualConversionDialog } from "./ManualConversionDialog";
import { DuplicatesDialog } from "./DuplicatesDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";


interface Props {
  conversions: ConversionRow[];
  profiles: ProfileLite[];
  priceMap: PriceMapEntry[];
  reference: CommissionReference[];
  isAdmin: boolean;
  onChanged: () => void;
}

export function ComissionamentoConversions({ conversions, profiles, priceMap, reference, isAdmin, onChanged }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [saleMonthFilter, setSaleMonthFilter] = useState<string>("all"); // YYYY-MM
  const [payMonthFilter, setPayMonthFilter] = useState<string>("all"); // YYYY-MM
  const [mapTarget, setMapTarget] = useState<ConversionRow | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ConversionRow | null>(null);
  const [dupOpen, setDupOpen] = useState(false);

  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  };

  const { saleMonths, payMonths } = useMemo(() => {
    const s = new Set<string>();
    const p = new Set<string>();
    for (const c of conversions) {
      const sd = parseDateOnly(c.sale_month);
      const pd = parseDateOnly(c.payment_month);
      if (sd) s.add(monthKey(sd));
      if (pd) p.add(monthKey(pd));
    }
    const sortDesc = (a: string, b: string) => b.localeCompare(a);
    return {
      saleMonths: Array.from(s).sort(sortDesc),
      payMonths: Array.from(p).sort(sortDesc),
    };
  }, [conversions]);
  const duplicateCount = useMemo(() => {
    const stripeKeys = new Set<string>();
    for (const c of conversions) {
      if ((c.source || "manual") !== "stripe") continue;
      const email = (c.customer_email || "").trim().toLowerCase();
      const dt = parseDateOnly(c.sale_month);
      if (!email || !dt) continue;
      stripeKeys.add(`${email}|${dt.getFullYear()}-${dt.getMonth() + 1}`);
    }
    let n = 0;
    for (const c of conversions) {
      const src = c.source || "manual";
      if (src === "stripe") continue;
      const email = (c.customer_email || "").trim().toLowerCase();
      const dt = parseDateOnly(c.sale_month);
      if (!email || !dt) continue;
      if (stripeKeys.has(`${email}|${dt.getFullYear()}-${dt.getMonth() + 1}`)) n++;
    }
    return n;
  }, [conversions]);


  const sellers = useMemo(() => {
    const set = new Map<string, string>();
    for (const c of conversions) {
      const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
      const p = c.resolved_seller_user_id ? profiles.find((p) => p.user_id === c.resolved_seller_user_id) : null;
      const name = p?.full_name || p?.email || c.resolved_seller_label || "—";
      set.set(key, name);
    }
    return Array.from(set.entries()).map(([k, v]) => ({ key: k, name: v }));
  }, [conversions, profiles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return conversions.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (sourceFilter !== "all" && (c.source || "manual") !== sourceFilter) return false;
      if (reviewFilter === "locked" && !c.manually_reviewed) return false;
      if (reviewFilter === "auto" && c.manually_reviewed) return false;
      if (sellerFilter !== "all") {
        const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
        if (key !== sellerFilter) return false;
      }
      if (saleMonthFilter !== "all") {
        const d = parseDateOnly(c.sale_month);
        if (!d || monthKey(d) !== saleMonthFilter) return false;
      }
      if (payMonthFilter !== "all") {
        const d = parseDateOnly(c.payment_month);
        if (!d || monthKey(d) !== payMonthFilter) return false;
      }
      if (q) {
        const hay = `${c.customer_name || ""} ${c.customer_email || ""} ${c.offer_name || ""} ${c.price_id || ""} ${c.resolved_plan || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [conversions, search, statusFilter, sellerFilter, sourceFilter, reviewFilter, saleMonthFilter, payMonthFilter]);

  const totalComissao = filtered.reduce((s, c) => s + Number(c.commission_amount || 0), 0);

  const fmtMonth = (d: string | null) => {
    const dt = parseDateOnly(d);
    return dt ? dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "") : "—";
  };

  const sellerName = (c: ConversionRow) => {
    if (c.resolved_seller_user_id) {
      const p = profiles.find((p) => p.user_id === c.resolved_seller_user_id);
      if (p) return p.full_name || p.email || c.resolved_seller_user_id;
    }
    return c.resolved_seller_label || "—";
  };

  const sourceBadge = (src: ConversionRow["source"]) => {
    if (src === "stripe") return <Badge variant="default" className="gap-1"><Zap className="h-3 w-3" />Stripe</Badge>;
    if (src === "import") return <Badge variant="secondary" className="gap-1"><FileUp className="h-3 w-3" />Import</Badge>;
    return <Badge variant="outline" className="gap-1"><User className="h-3 w-3" />Manual</Badge>;
  };

  const unlockReview = async (c: ConversionRow) => {
    if (!confirm("Destravar recálculo automático desta comissão? Os valores serão recalculados a partir do Stripe no próximo processamento.")) return;
    const { error } = await supabase
      .from("commission_conversions")
      .update({ manually_reviewed: false, override_fields: [], reviewed_by: null, reviewed_at: null })
      .eq("id", c.id);
    if (error) {
      toast({ title: "Erro ao destravar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Recálculo destravado" });
    onChanged();
  };

  const exportXlsx = () => {
    const statusLbl: Record<string, string> = {
      calculated: "Calculado",
      pending_mapping: "Pendente mapeamento",
      ignored: "Ignorado",
    };
    const data = filtered.map((c) => ({
      Origem: c.source || "manual",
      "Mês Venda": c.sale_month || "",
      "Mês Pagamento": c.payment_month || "",
      Cliente: c.customer_name || "",
      "Email Cliente": c.customer_email || "",
      Vendedor: sellerName(c),
      Plano: c.resolved_plan || "",
      Periodicidade: c.resolved_payment_type
        ? PAYMENT_TYPE_LABEL[c.resolved_payment_type as PaymentType]
        : "",
      Oferta: c.offer_name || "",
      "Price ID": c.price_id || "",
      "MRR (R$)": Number(c.mrr || 0),
      "Comissão %": Number(c.commission_pct || 0),
      "Comissão (R$)": Number(c.commission_amount || 0),
      Status: statusLbl[c.status] || c.status,
      "Revisada Manualmente": c.manually_reviewed ? "Sim" : "Não",
      "Origem Cliente": c.origem_cliente || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conversões");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const stamp = new Date().toISOString().slice(0, 10);
    saveAs(
      new Blob([buf], { type: "application/octet-stream" }),
      `conversoes_comissionamento_${stamp}.xlsx`,
    );
    toast({ title: "Exportação concluída", description: `${data.length} linhas exportadas.` });
  };



  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm font-medium">Conversões</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {filtered.length} linhas · Total: <span className="font-medium text-foreground">{BRL(totalComissao)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar cliente, plano..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-48"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="calculated">Calculado</SelectItem>
              <SelectItem value="pending_mapping">Pendente mapeamento</SelectItem>
              <SelectItem value="ignored">Ignorado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas origens</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
              <SelectItem value="import">Importado</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reviewFilter} onValueChange={setReviewFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas revisões</SelectItem>
              <SelectItem value="locked">Revisadas (travadas)</SelectItem>
              <SelectItem value="auto">Automáticas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={saleMonthFilter} onValueChange={setSaleMonthFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Mês Venda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos meses (Venda)</SelectItem>
              {saleMonths.map((k) => (
                <SelectItem key={k} value={k} className="capitalize">Venda: {monthLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payMonthFilter} onValueChange={setPayMonthFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Mês Pagto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos meses (Pagto)</SelectItem>
              {payMonths.map((k) => (
                <SelectItem key={k} value={k} className="capitalize">Pagto: {monthLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(saleMonthFilter !== "all" || payMonthFilter !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSaleMonthFilter("all"); setPayMonthFilter("all"); }}
              title="Limpar filtros de mês"
            >
              <X className="h-4 w-4 mr-1" /> Limpar meses
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={exportXlsx}
            disabled={filtered.length === 0}
            title="Exportar em Excel"
          >
            <Download className="h-4 w-4 mr-1" /> Exportar XLSX
          </Button>
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDupOpen(true)}
                disabled={duplicateCount === 0}
                title={duplicateCount === 0 ? "Nenhuma duplicata detectada" : `${duplicateCount} duplicata(s) detectada(s)`}
              >
                <Copy className="h-4 w-4 mr-1" />
                Remover duplicatas
                {duplicateCount > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 px-1.5">{duplicateCount}</Badge>
                )}
              </Button>
              <Button size="sm" onClick={() => setManualOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar manual
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Origem</TableHead>
              <TableHead className="text-left">Mês Venda</TableHead>
              <TableHead className="text-left">Mês Pagto</TableHead>
              <TableHead className="text-left">Cliente</TableHead>
              <TableHead className="text-left">Vendedor</TableHead>
              <TableHead className="text-left">Plano</TableHead>
              <TableHead className="text-left">Tipo</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead className="text-left">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Nenhuma conversão encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtered.slice(0, 500).map((c) => (
              <TableRow key={c.id} className={c.manually_reviewed ? "bg-amber-50/50 dark:bg-amber-950/10" : undefined}>
                <TableCell className="text-left">
                  <div className="flex items-center gap-1">
                    {sourceBadge(c.source || "manual")}
                    {c.manually_reviewed && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock className="h-3.5 w-3.5 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <div className="text-xs">
                              Revisada manualmente
                              {c.reviewed_at && ` em ${new Date(c.reviewed_at).toLocaleString("pt-BR")}`}
                              {c.override_fields?.length > 0 && (
                                <div className="mt-1">Campos travados: {c.override_fields.join(", ")}</div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-left">{fmtMonth(c.sale_month)}</TableCell>
                <TableCell className="text-left">{fmtMonth(c.payment_month)}</TableCell>
                <TableCell className="text-left">
                  <div className="font-medium">{c.customer_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.customer_email || ""}</div>
                </TableCell>
                <TableCell className="text-left">{sellerName(c)}</TableCell>
                <TableCell className="text-left">
                  <div>{c.resolved_plan || <span className="text-muted-foreground italic">não mapeado</span>}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.offer_name || c.price_id || ""}</div>
                </TableCell>
                <TableCell className="text-left">
                  {c.resolved_payment_type ? PAYMENT_TYPE_LABEL[c.resolved_payment_type as PaymentType] : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{BRL(Number(c.mrr || 0))}</TableCell>
                <TableCell className="text-right tabular-nums">{(Number(c.commission_pct || 0) * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{BRL(Number(c.commission_amount || 0))}</TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-2">
                    {c.status === "pending_mapping" ? (
                      <>
                        <Badge variant="destructive">Pendente</Badge>
                        {isAdmin && (
                          <Button size="sm" variant="outline" onClick={() => setMapTarget(c)}>
                            <MapPin className="h-3 w-3 mr-1" /> Mapear
                          </Button>
                        )}
                      </>
                    ) : c.status === "ignored" ? (
                      <Badge variant="secondary">Ignorado</Badge>
                    ) : (
                      <Badge variant="default">Calculado</Badge>
                    )}
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTarget(c)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isAdmin && c.manually_reviewed && c.source === "stripe" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => unlockReview(c)} title="Destravar recálculo">
                        <Unlock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 500 && (
          <div className="text-center text-xs text-muted-foreground py-3">
            Mostrando 500 de {filtered.length} linhas — refine os filtros para ver mais.
          </div>
        )}
      </CardContent>
      {mapTarget && (
        <MapPriceDialog
          target={mapTarget}
          reference={reference}
          priceMap={priceMap}
          profiles={profiles}
          onClose={() => setMapTarget(null)}
          onMapped={() => { setMapTarget(null); onChanged(); }}
        />
      )}
      {manualOpen && (
        <ManualConversionDialog
          reference={reference}
          profiles={profiles}
          onClose={() => setManualOpen(false)}
          onSaved={() => { setManualOpen(false); onChanged(); }}
        />
      )}
      {editTarget && (
        <ManualConversionDialog
          reference={reference}
          profiles={profiles}
          existing={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onChanged(); }}
        />
      )}
      {dupOpen && (
        <DuplicatesDialog
          conversions={conversions}
          onClose={() => setDupOpen(false)}
          onDone={() => { setDupOpen(false); onChanged(); }}
        />
      )}
    </Card>
  );
}
