import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save } from "lucide-react";
import { addMonths, buildQuotaShares, type PlanRow } from "@/lib/commercialPlan";
import type { QuotaRow, SellerLite } from "@/hooks/useCommercialPlan";

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]}/${String(y).slice(2)}`;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface EditState {
  quota: string;
  isManual: boolean;
}

interface Props {
  sellers: SellerLite[];
  historyByMonth: Record<string, Record<string, number>>;
  rows: PlanRow[];
  savedQuotas: QuotaRow[];
  currentMonth: string;
  canEdit: boolean;
  onOpenMonth: (ym: string) => void;
  onSave: (ym: string, rows: Array<{ seller_id: string; quota_new_mrr: number; quota_deals: number | null; weight: number; is_manual: boolean }>) => Promise<void>;
}

export function QuotasPanel({ sellers, historyByMonth, rows, savedQuotas, currentMonth, canEdit, onOpenMonth, onSave }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [windowMonths, setWindowMonths] = useState(6);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    onOpenMonth(month);
    setEdits({});
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // opções de mês: meses do plano a partir do vigente
  const monthOptions = useMemo(
    () => rows.filter((r) => r.yearMonth >= currentMonth).map((r) => r.yearMonth),
    [rows, currentMonth],
  );

  const planRow = useMemo(() => rows.find((r) => r.yearMonth === month) || null, [rows, month]);
  const totalQuota = planRow?.newMrrTarget ?? 0;

  const savedBySeller = useMemo(() => {
    const map: Record<string, { quota_new_mrr: number | null; is_manual: boolean }> = {};
    for (const q of savedQuotas) {
      if (q.year_month.slice(0, 7) !== month) continue;
      map[q.seller_id] = { quota_new_mrr: q.quota_new_mrr, is_manual: !!q.is_manual };
    }
    return map;
  }, [savedQuotas, month]);

  // Histórico do vendedor limitado aos meses fechados da janela (3 ou 6).
  const windowHistory = useMemo(() => {
    const closed: string[] = [];
    for (let i = 1; i <= windowMonths; i++) closed.push(addMonths(currentMonth, -i));
    const out: Record<string, number> = {};
    for (const s of sellers) {
      out[s.id] = closed.reduce((sum, m) => sum + (historyByMonth[m]?.[s.id] || 0), 0);
    }
    return out;
  }, [sellers, historyByMonth, windowMonths, currentMonth]);

  // Quotas calculadas (rateio automático) — as manuais salvas têm prioridade.
  const computed = useMemo(
    () =>
      buildQuotaShares({
        sellers,
        history: windowHistory,
        totalQuota,
        saved: savedBySeller,
      }),
    [sellers, windowHistory, totalQuota, savedBySeller],
  );

  const view = useMemo(() => {
    return computed.map((share) => {
      const edit = edits[share.sellerId];
      const quota = edit ? Number(edit.quota || 0) : share.quotaNewMrr;
      return {
        sellerId: share.sellerId,
        name: sellers.find((s) => s.id === share.sellerId)?.name || share.sellerId,
        historyMrr: sellerHistory[share.sellerId] || 0,
        weight: share.weight,
        quota,
        isManual: edit ? edit.isManual : share.isManual,
        realizedMonth: historyByMonth[month]?.[share.sellerId] ?? null,
      };
    });
  }, [computed, edits, sellers, sellerHistory, historyByMonth, month]);

  const totalQuotaView = view.reduce((s, r) => s + (r.quota || 0), 0);
  const totalRealized = view.reduce((s, r) => s + (r.realizedMonth || 0), 0);

  function editQuota(sellerId: string, value: string) {
    setEdits((prev) => ({ ...prev, [sellerId]: { quota: value, isManual: true } }));
    setDirty(true);
  }

  function clearEdits() {
    setEdits({});
    setDirty(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(
        month,
        view.map((r) => ({
          seller_id: r.sellerId,
          quota_new_mrr: Number(r.quota) || 0,
          quota_deals: null,
          weight: r.weight,
          is_manual: r.isManual,
        })),
      );
      clearEdits();
    } finally {
      setSaving(false);
    }
  }

  const totalHistory = view.reduce((s, r) => s + Math.max(r.historyMrr, 0), 0);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading font-semibold text-base">Quotas por vendedor</h3>
            <p className="text-sm text-muted-foreground">
              Rateio do New MRR alvo do mês proporcional ao realizado histórico do vendedor.
              Edite uma quota para travá-la manualmente.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Janela de histórico</Label>
              <Select value={String(windowMonths)} onValueChange={(v) => setWindowMonths(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">New MRR na janela</TableHead>
                <TableHead className="text-right">Peso</TableHead>
                <TableHead className="text-right">Quota (R$)</TableHead>
                <TableHead className="text-right">Realizado no mês</TableHead>
                <TableHead className="text-right">Atingimento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!sellers.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum vendedor cadastrado.</TableCell></TableRow>
              )}
              {sellers.length > 0 && view.map((r) => {
                const achievement = r.quota > 0 && r.realizedMonth != null ? r.realizedMonth / r.quota : null;
                return (
                  <TableRow key={r.sellerId}>
                    <TableCell className="whitespace-nowrap">
                      {r.name}
                      {r.isManual && <Badge variant="outline" className="ml-2">manual</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{fmtBRL(totalHistory > 0 ? r.historyMrr : null)}</TableCell>
                    <TableCell className="text-right">
                      {totalHistory > 0 ? `${(r.weight * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right w-40">
                      {canEdit ? (
                        <Input
                          inputMode="decimal"
                          className="h-8 text-right"
                          value={r.isManual || edits[r.sellerId] ? (edits[r.sellerId]?.quota ?? String(Math.round(r.quota))) : String(Math.round(r.quota))}
                          onChange={(e) => editQuota(r.sellerId, e.target.value)}
                          aria-label={`Quota de ${r.name}`}
                        />
                      ) : (
                        fmtBRL(r.quota)
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmtBRL(r.realizedMonth)}</TableCell>
                    <TableCell className="text-right">
                      {achievement == null ? "—" : `${(achievement * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sellers.length > 0 && (
                <TableRow className="font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalHistory)}</TableCell>
                  <TableCell className="text-right">{totalHistory > 0 ? "100%" : "—"}</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalQuotaView)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalRealized)}</TableCell>
                  <TableCell className="text-right">
                    {totalQuotaView > 0 && totalRealized != null
                      ? `${((totalRealized / totalQuotaView) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                      : "—"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {canEdit && sellers.length > 0 && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={clearEdits} disabled={!dirty || saving}>
              <RefreshCw className="h-4 w-4 mr-1" /> Recalcular rateio
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar quotas"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Quota total do mês: <strong>{fmtBRL(totalQuota)}</strong> (vem do Plano de MRR; edite no
          bloco acima). Sem histórico na janela, a quota fica zerada para ajuste manual.
          {windowMonths === 3 ? " Janela: últimos 3 meses." : " Janela: últimos 6 meses."}
        </p>
      </CardContent>
    </Card>
  );
}
