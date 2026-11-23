import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Projeção manual de fechamento das campanhas do mês (compartilhada pela equipe). */
export function CampaignManualProjection({ ym, label, realizedMrr, realizedQty, autoMrr, autoQty }: {
  ym: string; label: string; realizedMrr: number; realizedQty: number; autoMrr: number; autoQty: number;
}) {
  const [mrr, setMrr] = useState(""); const [qty, setQty] = useState("");
  const [saved, setSaved] = useState<{ mrr: number | null; qty: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${ym}-01`;
  useEffect(() => {
    supabase.from("campaign_month_projections").select("mrr,qty").eq("year_month", key).maybeSingle().then(({ data }) => {
      setSaved(data ? { mrr: data.mrr, qty: data.qty } : null);
      setMrr(data?.mrr != null ? String(data.mrr) : ""); setQty(data?.qty != null ? String(data.qty) : "");
    });
  }, [key]);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\./g, "").replace(",", ".")));
  const save = async () => {
    const m = num(mrr), q = num(qty);
    if ((m != null && isNaN(m)) || (q != null && isNaN(q))) return toast.error("Valor inválido");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("campaign_month_projections").upsert({ year_month: key, mrr: m, qty: q == null ? null : Math.round(q), updated_by: u.user?.id, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    setSaved({ mrr: m, qty: q }); toast.success("Projeção de campanhas salva");
  };
  const pct = (r: number, t: number | null | undefined) => (t ? `${((r / t) * 100).toFixed(0)}% atingido` : "");
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Projeção manual de fechamento das campanhas — {label}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs space-y-1"><div className="text-muted-foreground">New MRR projetado (R$)</div>
            <Input className="h-8 w-40" inputMode="decimal" value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder={String(Math.round(autoMrr))} /></label>
          <label className="text-xs space-y-1"><div className="text-muted-foreground">Vendas projetadas</div>
            <Input className="h-8 w-28" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={String(Math.round(autoQty))} /></label>
          <Button size="sm" onClick={save} disabled={busy}>Salvar</Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Realizado até hoje: <strong>{brl(realizedMrr)}</strong> · {Math.round(realizedQty)} vendas · Tendência automática: {brl(autoMrr)} · {Math.round(autoQty)} vendas</div>
          {saved && (saved.mrr != null || saved.qty != null) && (
            <div>Projeção salva: {saved.mrr != null ? `${brl(saved.mrr)} (${pct(realizedMrr, saved.mrr)})` : "—"} · {saved.qty != null ? `${saved.qty} vendas (${pct(realizedQty, saved.qty)})` : "—"}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
