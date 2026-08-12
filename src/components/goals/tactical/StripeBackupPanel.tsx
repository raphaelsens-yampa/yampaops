import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, ChevronDown, DatabaseBackup, RotateCcw, Save, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { parseDateBR } from "@/lib/dateBR";
import { toBRDateKey, Profile } from "./types";

type MetricKey = "vendas_dia" | "recuperados_ft";

interface BackupRow {
  data: string;
  metric_key: string;
  user_id: string | null;
  qtd: number;
  mrr: number;
  captured_at?: string;
}

const METRIC_LABEL: Record<string, string> = {
  vendas_dia: "Vendas do dia (New MRR)",
  recuperados_ft: "Recuperados FT",
  upsell_dia: "Upsell",
};

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Agrega as conversões do Stripe de um dia por vendedor e tipo. */
async function stripeSnapshot(dateKey: string): Promise<BackupRow[]> {
  const from = parseDateBR(dateKey);
  const to = new Date(from);
  to.setHours(23, 59, 59, 999);
  const { data } = await supabase
    .from("stripe_conversions")
    .select("assigned_seller_id, converted_at, mrr_net, mrr, is_reactivation")
    .gte("converted_at", from.toISOString())
    .lte("converted_at", to.toISOString());

  const agg = new Map<string, BackupRow>();
  for (const c of (data as any[]) || []) {
    const seller = c.assigned_seller_id as string | null;
    const value = Number(c.mrr_net ?? c.mrr ?? 0);
    if (!seller || !(value > 0)) continue;
    if (toBRDateKey(parseDateBR(c.converted_at)) !== dateKey) continue;
    const metric_key: MetricKey = c.is_reactivation ? "recuperados_ft" : "vendas_dia";
    const k = `${metric_key}|${seller}`;
    const prev = agg.get(k);
    if (prev) {
      prev.qtd += 1;
      prev.mrr += value;
    } else {
      agg.set(k, { data: dateKey, metric_key, user_id: seller, qtd: 1, mrr: value });
    }
  }
  return Array.from(agg.values());
}

export function StripeBackupPanel({
  profiles,
  today,
  onChanged,
}: {
  profiles: Profile[];
  today: Date;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>(today);
  const dateKey = toBRDateKey(date);
  const realTodayKey = toBRDateKey(new Date());
  const [live, setLive] = useState<BackupRow[]>([]);
  const [backup, setBackup] = useState<BackupRow[]>([]);
  const [overrideKeys, setOverrideKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const name = (id: string | null) =>
    profiles.find((p) => p.user_id === id)?.full_name || "—";

  const load = useCallback(async () => {
    const [snap, bkp, ovs] = await Promise.all([
      stripeSnapshot(dateKey),
      supabase
        .from("tactical_stripe_daily_backup")
        .select("data, metric_key, user_id, qtd, mrr, captured_at")
        .eq("data", dateKey),
      supabase.from("tactical_realized_overrides").select("metric_key").eq("data", dateKey),
    ]);
    setLive(snap);
    setBackup(((bkp.data as any[]) || []) as BackupRow[]);
    setOverrideKeys(Array.from(new Set(((ovs.data as any[]) || []).map((r) => r.metric_key))));
  }, [dateKey]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  /** Salva o snapshot do Stripe do dia na tabela de backup. */
  const saveBackup = async () => {
    setBusy(true);
    const rows = await stripeSnapshot(dateKey);
    const { error } = await supabase.from("tactical_stripe_daily_backup").upsert(
      rows.map((r) => ({ ...r, captured_at: new Date().toISOString() })),
      { onConflict: "data,metric_key,user_id" },
    );
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao salvar backup", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Backup salvo", description: `${rows.length} registro(s) do Stripe em ${dateKey}.` });
    load();
  };

  /** Força o realizado do dia com os dados do backup do Stripe (override). */
  const forceFromStripe = async () => {
    setBusy(true);
    const source = backup.length ? backup : await stripeSnapshot(dateKey);
    if (!source.length) {
      setBusy(false);
      toast({ title: "Sem dados do Stripe", description: `Nada a forçar em ${dateKey}.` });
      return;
    }
    const { error } = await supabase.from("tactical_realized_overrides").upsert(
      source.map((r) => ({
        data: r.data,
        metric_key: r.metric_key,
        user_id: r.user_id,
        qtd: Math.round(r.qtd),
        mrr: r.mrr,
        origem: "stripe_backup",
        created_by: user?.id ?? null,
      })),
      { onConflict: "data,metric_key,user_id" },
    );
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao forçar atualização", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Realizado forçado", description: `${dateKey} agora usa a base do Stripe.` });
    load();
    onChanged?.();
  };

  const clearOverride = async () => {
    setBusy(true);
    const { error } = await supabase.from("tactical_realized_overrides").delete().eq("data", dateKey);
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Override removido", description: `${dateKey} volta à fonte canônica.` });
    load();
    onChanged?.();
  };

  const rows = backup.length ? backup : live;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 md:py-4 flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4" />
              Backup diário do Stripe
              {overrideKeys.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">override ativo</Badge>
              )}
            </CardTitle>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <p className="text-xs text-muted-foreground">
              Realizado canônico: <strong>hoje</strong> vem do Stripe, <strong>dias anteriores</strong> vêm do
              Metabase (D-1). Use o backup abaixo para inspecionar o Stripe do dia e, se necessário,
              sobrescrever o histórico.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 justify-start font-normal">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {format(date, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => toBRDateKey(d) > realTodayKey}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={saveBackup}>
                <Save className="h-4 w-4 mr-1" /> Salvar backup do dia
              </Button>
              <Button size="sm" className="h-9" disabled={busy} onClick={forceFromStripe}>
                <Zap className="h-4 w-4 mr-1" /> Forçar Atualização com base Stripe
              </Button>
              {overrideKeys.length > 0 && (
                <Button variant="ghost" size="sm" className="h-9" disabled={busy} onClick={clearOverride}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Remover override
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Métrica</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                        Nenhuma conversão do Stripe em {dateKey}.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={`${r.metric_key}|${r.user_id}`}>
                      <TableCell className="text-sm">{METRIC_LABEL[r.metric_key] ?? r.metric_key}</TableCell>
                      <TableCell className="text-sm">{name(r.user_id)}</TableCell>
                      <TableCell className="text-right text-sm">{Math.round(r.qtd)}</TableCell>
                      <TableCell className="text-right text-sm">{money(Number(r.mrr || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {backup.length
                ? "Exibindo o backup salvo deste dia."
                : "Exibindo a leitura ao vivo do Stripe (sem backup salvo ainda)."}
            </p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
