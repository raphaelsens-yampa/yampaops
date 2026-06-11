import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRL, PAYMENT_TYPE_LABEL, type CommissionReference, type PriceMapEntry, type PaymentType } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";
import { MapPin, Plus } from "lucide-react";
import { MapPriceDialog } from "./MapPriceDialog";
import { ManualConversionDialog } from "./ManualConversionDialog";

interface Props {
  conversions: ConversionRow[];
  profiles: ProfileLite[];
  priceMap: PriceMapEntry[];
  reference: CommissionReference[];
  isAdmin: boolean;
  onChanged: () => void;
}

export function ComissionamentoConversions({ conversions, profiles, priceMap, reference, isAdmin, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [mapTarget, setMapTarget] = useState<ConversionRow | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

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
      if (sellerFilter !== "all") {
        const key = c.resolved_seller_user_id || `lbl:${c.resolved_seller_label || "—"}`;
        if (key !== sellerFilter) return false;
      }
      if (q) {
        const hay = `${c.customer_name || ""} ${c.customer_email || ""} ${c.offer_name || ""} ${c.price_id || ""} ${c.resolved_plan || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [conversions, search, statusFilter, sellerFilter]);

  const totalComissao = filtered.reduce((s, c) => s + Number(c.commission_amount || 0), 0);

  const fmtMonth = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "") : "—";

  const sellerName = (c: ConversionRow) => {
    if (c.resolved_seller_user_id) {
      const p = profiles.find((p) => p.user_id === c.resolved_seller_user_id);
      if (p) return p.full_name || p.email || c.resolved_seller_user_id;
    }
    return c.resolved_seller_label || "—";
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
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Nenhuma conversão encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtered.slice(0, 500).map((c) => (
              <TableRow key={c.id}>
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
                  {c.status === "pending_mapping" ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Pendente</Badge>
                      {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => setMapTarget(c)}>
                          <MapPin className="h-3 w-3 mr-1" /> Mapear
                        </Button>
                      )}
                    </div>
                  ) : c.status === "ignored" ? (
                    <Badge variant="secondary">Ignorado</Badge>
                  ) : (
                    <Badge variant="default">Calculado</Badge>
                  )}
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
    </Card>
  );
}
