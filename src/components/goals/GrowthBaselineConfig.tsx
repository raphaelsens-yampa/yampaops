import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { notifyGrowthBaselinesChanged, useGrowthBaselines } from "@/hooks/useGrowthBaselines";

type FormState = { id?: string; effectiveMonth: string; growthPct: string; note: string };
const EMPTY_FORM: FormState = { effectiveMonth: "", growthPct: "", note: "" };

function formatMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-");
  return year && month ? `${month}/${year}` : value;
}

export function GrowthBaselineConfig() {
  const { user } = useAuth();
  const { baselines, loading } = useGrowthBaselines();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () => [...baselines].sort((a, b) => a.effective_month.localeCompare(b.effective_month)),
    [baselines],
  );

  function startCreate() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function startEdit(row: (typeof baselines)[number]) {
    setForm({
      id: row.id,
      effectiveMonth: row.effective_month.slice(0, 7),
      growthPct: String(row.growth_pct).replace(".", ","),
      note: row.note || "",
    });
    setOpen(true);
  }

  async function save() {
    const growthPct = Number(form.growthPct.replace(",", "."));
    if (!/^\d{4}-\d{2}$/.test(form.effectiveMonth) || !Number.isFinite(growthPct) || growthPct < 0 || growthPct > 100) {
      toast({ title: "Revise os campos", description: "Informe um mês válido e um percentual entre 0% e 100%.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      effective_month: `${form.effectiveMonth}-01`,
      growth_pct: growthPct,
      note: form.note.trim() || null,
      ...(form.id ? {} : { created_by: user?.id || null }),
    };
    const result = form.id
      ? await (supabase as any).from("goal_growth_baselines").update(payload).eq("id", form.id)
      : await (supabase as any).from("goal_growth_baselines").insert(payload);
    setSaving(false);
    if (result.error) {
      const duplicate = result.error.code === "23505";
      toast({ title: "Não foi possível salvar", description: duplicate ? "Já existe uma revisão para esse mês." : result.error.message, variant: "destructive" });
      return;
    }
    setOpen(false);
    notifyGrowthBaselinesChanged();
    toast({ title: form.id ? "Revisão atualizada" : "Revisão cadastrada" });
  }

  async function remove(id: string) {
    const { error } = await (supabase as any).from("goal_growth_baselines").delete().eq("id", id);
    if (error) {
      toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" });
      return;
    }
    notifyGrowthBaselinesChanged();
    toast({ title: "Revisão excluída" });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Base de crescimento</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina a taxa oficial por mês. A revisão vale a partir do mês indicado e não altera meses já encerrados.
          </p>
        </div>
        <Button onClick={startCreate} size="sm" className="shrink-0"><Plus className="mr-1 h-4 w-4" /> Nova revisão</Button>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Carregando revisões...</p> : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma revisão cadastrada. O sistema usa 1% a.m. como base padrão.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead className="text-left">A partir de</TableHead><TableHead className="text-right">Crescimento</TableHead><TableHead className="text-left">Observação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatMonth(row.effective_month)}</TableCell>
                  <TableCell className="text-right font-medium">{Number(row.growth_pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.m.</TableCell>
                  <TableCell className="text-muted-foreground">{row.note || "—"}</TableCell>
                  <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Editar revisão de ${formatMonth(row.effective_month)}`} onClick={() => startEdit(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Excluir revisão de ${formatMonth(row.effective_month)}`} onClick={() => remove(row.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Editar revisão" : "Nova revisão da base"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1"><Label htmlFor="growth-effective-month">Mês de início</Label><Input id="growth-effective-month" type="month" value={form.effectiveMonth} onChange={(e) => setForm({ ...form, effectiveMonth: e.target.value })} /><p className="text-xs text-muted-foreground">Ex.: 09/2026 aplica a partir de setembro.</p></div>
            <div className="space-y-1"><Label htmlFor="growth-pct">Crescimento mensal (%)</Label><Input id="growth-pct" inputMode="decimal" placeholder="Ex.: 1,2" value={form.growthPct} onChange={(e) => setForm({ ...form, growthPct: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="growth-note">Observação (opcional)</Label><Textarea id="growth-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ex.: Revisão da meta de setembro" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar revisão"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
