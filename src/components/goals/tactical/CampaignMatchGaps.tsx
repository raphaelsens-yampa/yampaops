import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Info, RefreshCw } from "lucide-react";
import { toBRDateKey } from "./types";

interface GapRow {
  gap_type: string;
  email: string;
  activation_date: string | null;
  converted_at: string | null;
  coupon_id: string | null;
  coupon_name: string | null;
  classification: string | null;
  mrr: number | null;
  manual_is_campaign: boolean | null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const brDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const GAP_LABEL: Record<string, string> = {
  cupom_sem_base: "Cobrança com cupom de campanha sem cliente ativo na base",
  base_sem_cobranca: "Cliente ativo na base sem cobrança registrada na janela",
};

/**
 * Divergências entre a base de ativos pagantes e as cobranças da Stripe com cupom
 * de campanha. Permite marcar manualmente um cliente como venda de campanha
 * quando a cobrança não chegou ao sistema; a marcação manual tem prioridade
 * sobre o vínculo automático no fechamento semanal.
 */
export function CampaignMatchGaps() {
  const monthStart = useMemo(() => {
    const d = new Date();
    return toBRDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);
  const todayKey = useMemo(() => toBRDateKey(new Date()), []);

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayKey);
  const [rows, setRows] = useState<GapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (from > to) {
      toast({ title: "Período inválido", description: "A data inicial deve ser anterior à final.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("tactical_campaign_match_gaps", {
      p_from: from,
      p_to: to,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Não foi possível carregar as divergências", description: error.message, variant: "destructive" });
      return;
    }
    setRows(((data as any[]) || []) as GapRow[]);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleManual = async (row: GapRow, next: boolean) => {
    const activation = row.activation_date ?? row.converted_at?.slice(0, 10) ?? null;
    if (!activation) {
      toast({ title: "Sem data de ativação", description: "Não é possível marcar este registro.", variant: "destructive" });
      return;
    }
    const key = `${row.email}|${activation}`;
    setSaving(key);
    const { error } = await supabase.from("tactical_campaign_manual_links").upsert(
      {
        email_norm: row.email.toLowerCase().trim(),
        activation_date: activation,
        coupon_id: row.coupon_id,
        is_campaign: next,
      },
      { onConflict: "email_norm,activation_date" },
    );
    setSaving(null);
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Marcado como campanha" : "Marcado como não-campanha" });
    await load();
  };

  const grouped = useMemo(() => {
    const acc = new Map<string, GapRow[]>();
    for (const r of rows) {
      const list = acc.get(r.gap_type) ?? [];
      list.push(r);
      acc.set(r.gap_type, list);
    }
    return Array.from(acc.entries());
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3 px-4 md:px-6">
        <CardTitle className="text-sm sm:text-base">Divergências de campanha</CardTitle>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          Clientes cuja venda não consegue ser ligada automaticamente a um cupom de campanha.
          Use a chave para marcar manualmente; a marcação manual tem prioridade no fechamento semanal.
        </p>
      </CardHeader>
      <CardContent className="px-4 md:px-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Badge variant="secondary" className="text-[10px]">{rows.length} divergências</Badge>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando divergências...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma divergência no período.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([type, list]) => (
              <div key={type} className="space-y-1">
                <p className="text-xs font-medium">{GAP_LABEL[type] ?? type}</p>
                <div className="divide-y rounded-md border">
                  {list.map((r) => {
                    const activation = r.activation_date ?? r.converted_at?.slice(0, 10) ?? "";
                    const key = `${r.email}|${activation}`;
                    return (
                      <div key={`${type}-${key}`} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{r.email}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.activation_date
                              ? `Início ${brDate(r.activation_date)}`
                              : `Cobrança ${brDate(r.converted_at)}`}
                            {r.classification ? ` · ${r.classification}` : ""}
                            {r.coupon_name ? ` · ${r.coupon_name}` : r.coupon_id ? ` · ${r.coupon_id}` : ""}
                            {r.mrr ? ` · ${brl(Number(r.mrr))}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-muted-foreground">
                            {r.manual_is_campaign === null ? "sem marcação" : r.manual_is_campaign ? "campanha" : "não-campanha"}
                          </span>
                          <Switch
                            checked={!!r.manual_is_campaign}
                            disabled={saving === key}
                            onCheckedChange={(v) => toggleManual(r, v)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
