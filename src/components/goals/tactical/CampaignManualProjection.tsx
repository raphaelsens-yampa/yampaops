import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { CollapseToggle } from "./CollapseToggle";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export interface CampaignProjectionRow { id?: string; name: string; start_date: string; end_date: string; mrr: number | null; qty: number | null }

/** Projeções manuais das campanhas do mês, com período; alimentam a Tendência do Pacing. */
export function CampaignManualProjection({ ym, label, rows, onSaved, realizedMrr, realizedQty, trendMrr, trendQty }: {
  ym: string; label: string; rows: CampaignProjectionRow[]; onSaved: () => void;
  realizedMrr: number; realizedQty: number; trendMrr: number; trendQty: number;
}) {
  const first = `${ym}-01`;
  const last = `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [adding, setAdding] = useState<any | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const num = (s: any) => (s == null || String(s).trim() === "" ? null : Number(String(s).replace(/\./g, "").replace(",", ".")));

  const save = async (r: any) => {
    const m = num(r.mrr), q = num(r.qty);
    if ((m != null && isNaN(m)) || (q != null && isNaN(q))) return toast.error("Valor inválido");
    if (!r.start_date || !r.end_date || r.end_date < r.start_date) return toast.error("Período inválido: o fim deve ser igual ou depois do início");
    if (r.start_date < first || r.end_date > last) return toast.error(`O período deve ficar dentro de ${label}`);
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = { year_month: first, name: r.name?.trim() || "Campanha", start_date: r.start_date, end_date: r.end_date, mrr: m, qty: q == null ? null : Math.round(q), updated_by: u.user?.id, updated_at: new Date().toISOString() };
    const { error } = r.id ? await supabase.from("campaign_projections").update(payload).eq("id", r.id) : await supabase.from("campaign_projections").insert(payload);
    setBusy(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Projeção da campanha salva");
    if (r.id) setDrafts((d) => { const n = { ...d }; delete n[r.id]; return n; }); else setAdding(null);
    onSaved();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("campaign_projections").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir: " + error.message);
    onSaved();
  };

  const totMrr = rows.reduce((a, r) => a + (r.mrr ?? 0), 0);
  const totQty = rows.reduce((a, r) => a + (r.qty ?? 0), 0);
  const pct = (r: number, t: number) => (t ? ` (${((r / t) * 100).toFixed(0)}% atingido)` : "");

  const Row = ({ r, onChange, onSave, onRemove }: { r: any; onChange: (k: string, v: string) => void; onSave: () => void; onRemove?: () => void }) => (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs space-y-1"><div className="text-muted-foreground">Campanha</div>
        <Input className="h-8 w-44" value={r.name ?? ""} onChange={(e) => onChange("name", e.target.value)} placeholder="Nome" /></label>
      <label className="text-xs space-y-1"><div className="text-muted-foreground">Início</div>
        <Input type="date" className="h-8 w-36" min={first} max={last} value={r.start_date ?? ""} onChange={(e) => onChange("start_date", e.target.value)} /></label>
      <label className="text-xs space-y-1"><div className="text-muted-foreground">Fim</div>
        <Input type="date" className="h-8 w-36" min={first} max={last} value={r.end_date ?? ""} onChange={(e) => onChange("end_date", e.target.value)} /></label>
      <label className="text-xs space-y-1"><div className="text-muted-foreground">New MRR (R$)</div>
        <Input className="h-8 w-28" inputMode="decimal" value={r.mrr ?? ""} onChange={(e) => onChange("mrr", e.target.value)} /></label>
      <label className="text-xs space-y-1"><div className="text-muted-foreground">Vendas</div>
        <Input className="h-8 w-20" inputMode="numeric" value={r.qty ?? ""} onChange={(e) => onChange("qty", e.target.value)} /></label>
      <Button size="sm" onClick={onSave} disabled={busy}>Salvar</Button>
      {onRemove && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove} aria-label="Excluir campanha"><Trash2 className="h-4 w-4" /></Button>}
    </div>
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <CollapseToggle open={open} onToggle={() => setOpen((v) => !v)} />
            <div className="truncate text-sm font-medium">Projeção das campanhas — {label}</div>
          </div>
          {open && !adding && <Button size="sm" variant="outline" onClick={() => setAdding({ name: "", start_date: first, end_date: last })}><Plus className="h-4 w-4 mr-1" />Adicionar campanha</Button>}
        </div>
        {open && (
          <>
            {rows.map((r) => {
              const d = { ...r, ...(drafts[r.id!] || {}) };
              return <div key={r.id}>{Row({ r: d, onChange: (k, v) => setDrafts((x) => ({ ...x, [r.id!]: { ...(x[r.id!] || {}), [k]: v } })), onSave: () => save(d), onRemove: () => remove(r.id!) })}</div>;
            })}
            {adding && Row({ r: adding, onChange: (k, v) => setAdding((a: any) => ({ ...a, [k]: v })), onSave: () => save(adding), onRemove: () => setAdding(null) })}
            {!rows.length && !adding && <div className="text-xs text-muted-foreground">Nenhuma campanha projetada. Sem projeção, a Tendência usa o ritmo automático.</div>}
          </>
        )}
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Realizado de campanhas até hoje: <strong>{brl(realizedMrr)}</strong> · {Math.round(realizedQty)} vendas</div>
          {rows.length > 0 && <div>Projetado: {brl(totMrr)}{pct(realizedMrr, totMrr)} · {totQty} vendas{pct(realizedQty, totQty)} · Tendência de campanhas: {brl(trendMrr)} · {Math.round(trendQty)} vendas</div>}
          {open && <div>O saldo de cada campanha é distribuído pelos dias úteis restantes do seu período.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
