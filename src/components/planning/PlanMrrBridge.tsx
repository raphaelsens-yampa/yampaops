import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid, Legend } from "recharts";
import type { PlanRow } from "@/lib/commercialPlan";
import type { CommercialPlanMonthRow } from "@/hooks/useCommercialPlan";

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]}/${String(y).slice(2)}`;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtInt = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

interface Props {
  rows: PlanRow[];
  loading: boolean;
  canEdit: boolean;
  onSave: (yearMonth: string, patch: Partial<CommercialPlanMonthRow>) => Promise<void>;
}

export function PlanMrrBridge({ rows, loading, canEdit, onSave }: Props) {
  const today = useMemo(() => monthKeyOfToday(), []);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [form, setForm] = useState({ newMrr: "", churnMrr: "", deals: "", ativos: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        mes: monthLabel(r.yearMonth),
        previsto: r.mrrEnd,
        realizado: r.realized?.totalMrr ?? null,
      })),
    [rows],
  );

  function openEdit(row: PlanRow) {
    const overrideRow = null;
    void overrideRow;
    setEditing(row);
    setForm({
      newMrr: row.source === "override" && row.newMrrTarget != null ? String(Math.round(row.newMrrTarget)) : "",
      churnMrr: row.source === "override" && row.churnMrrTarget != null ? String(Math.round(row.churnMrrTarget)) : "",
      deals: row.source === "override" && row.dealsTarget != null ? String(row.dealsTarget) : "",
      ativos: row.source === "override" && row.ativosTarget != null ? String(row.ativosTarget) : "",
      notes: "",
    });
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
      await onSave(editing.yearMonth, {
        target_new_mrr: n(form.newMrr),
        target_churn_mrr: n(form.churnMrr),
        target_deals: form.deals.trim() === "" ? null : Number(form.deals),
        target_ativos: form.ativos.trim() === "" ? null : Number(form.ativos),
        notes: form.notes.trim() === "" ? null : form.notes,
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-base">Plano de MRR (bridge mensal)</h3>
          <p className="text-sm text-muted-foreground">
            New MRR, Churn MRR e MRR previsto por mês. Meses sem cadastro manual seguem a base de
            crescimento cadastrada; meses fechados ancoram no realizado oficial (Metabase).
          </p>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <ReTooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="previsto" name="MRR previsto" stroke="#01B8E0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="realizado" name="MRR realizado" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Taxa (a.m.)</TableHead>
                <TableHead className="text-right">New MRR alvo</TableHead>
                <TableHead className="text-right">Churn MRR alvo</TableHead>
                <TableHead className="text-right">Net MRR alvo</TableHead>
                <TableHead className="text-right">MRR fim previsto</TableHead>
                <TableHead className="text-right">Ativos prev.</TableHead>
                <TableHead className="text-right">Deals alvo</TableHead>
                <TableHead className="text-right">R. New MRR</TableHead>
                <TableHead className="text-right">R. Churn MRR</TableHead>
                <TableHead className="text-right">R. MRR fim</TableHead>
                <TableHead className="text-right">Atingimento</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">Carregando plano...</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => {
                const isCurrent = r.yearMonth === today;
                const past = r.yearMonth < today;
                const achievement = r.newMrrTarget != null && r.realized?.newMrr != null
                  ? r.realized.newMrr / r.newMrrTarget
                  : null;
                return (
                  <TableRow key={r.yearMonth} className={isCurrent ? "bg-muted/40 font-medium" : past ? "text-muted-foreground" : ""}>
                    <TableCell className="whitespace-nowrap">
                      {monthLabel(r.yearMonth)}
                      {isCurrent && <Badge variant="outline" className="ml-2">vigente</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{r.growthPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.newMrrTarget)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.churnMrrTarget)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.netMrrTarget)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.mrrEnd)}</TableCell>
                    <TableCell className="text-right">{fmtInt(r.ativosTarget)}</TableCell>
                    <TableCell className="text-right">{fmtInt(r.dealsTarget)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.realized?.newMrr)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.realized?.churnMrr)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.realized?.totalMrr)}</TableCell>
                    <TableCell className="text-right">{fmtPct(achievement)}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Editar plano de ${monthLabel(r.yearMonth)}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Plano de {editing ? monthLabel(editing.yearMonth) : ""}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Deixe um campo vazio para manter o valor calculado pela base de crescimento.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-new-mrr">New MRR (R$)</Label>
                <Input id="plan-new-mrr" inputMode="decimal" value={form.newMrr} onChange={(e) => setForm({ ...form, newMrr: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-churn-mrr">Churn MRR (R$)</Label>
                <Input id="plan-churn-mrr" inputMode="decimal" value={form.churnMrr} onChange={(e) => setForm({ ...form, churnMrr: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-deals">Deals alvo</Label>
                <Input id="plan-deals" inputMode="numeric" value={form.deals} onChange={(e) => setForm({ ...form, deals: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-ativos">Ativos pagantes</Label>
                <Input id="plan-ativos" inputMode="numeric" value={form.ativos} onChange={(e) => setForm({ ...form, ativos: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="plan-notes">Observação</Label>
                <Textarea id="plan-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar plano"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function monthKeyOfToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
