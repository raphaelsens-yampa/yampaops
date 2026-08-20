import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, ChevronDown, ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { parseDateBR } from "@/lib/dateBR";
import { Profile, TacticalMetric, toBRDateKey } from "./types";
import { RecoveryEntryDialog } from "./RecoveryEntryDialog";
import { RecoveryEditDialog, EditableRecovery } from "./RecoveryEditDialog";
import { RecoveryReasonsConfig } from "./RecoveryReasonsConfig";
import { RecoveryBulkClassifyDialog, BulkTarget } from "./RecoveryBulkClassifyDialog";
import { CHANNEL_LABEL, RecoveryChannel, useRecoveryReasons } from "./recoveryChannels";


interface Row {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  date: string;
  price: number;
  mrr: number;
  seller_id: string | null;
  origin: "stripe" | "manual" | "import";
  qty: number;
  entryKind: "recovered" | "retained";
  rawId?: string;
  kind?: "recovery" | "manual_entry";
  note?: string | null;
  channel: RecoveryChannel;
  reasonId: string | null;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}


export function TeamRecoveriesTable({
  memberIds,
  profiles,
  metrics,
  teamName,
  today,
  refreshKey = 0,
}: {
  memberIds: string[];
  profiles: Profile[];
  metrics: TacticalMetric[];
  teamName: string | null;
  today: Date;
  refreshKey?: number;
}) {
  const [days, setDays] = useState("30");
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [kindFilter, setKindFilter] = useState<"all" | "recovered" | "retained">("all");
  const [channelFilter, setChannelFilter] = useState<"all" | RecoveryChannel>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const { reasons, reload: reloadReasons } = useRecoveryReasons();
  const reasonName = useMemo(
    () => new Map(reasons.map((r) => [r.id, r.name])),
    [reasons],
  );
  const [editing, setEditing] = useState<EditableRecovery | null>(null);
  const [deleting, setDeleting] = useState<EditableRecovery | null>(null);
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [bulkOpen, setBulkOpen] = useState(false);



  const recoveryMetricIds = useMemo(
    () =>
      metrics
        .filter(
          (m) =>
            m.key === "clientes_recuperados" ||
            m.key === "clientes_retidos" ||
            m.source === "stripe_reactivation",
        )
        .map((m) => m.id),
    [metrics],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const from = new Date(today);
      from.setDate(from.getDate() - (Number(days) - 1));
      from.setHours(0, 0, 0, 0);
      const to = new Date(today);
      to.setHours(23, 59, 59, 999);

      const [convRes, manualRes, recRes] = await Promise.all([
        supabase
          .from("stripe_conversions")
          .select("id, customer_email, plan_name, product_name, converted_at, mrr, mrr_net, net_amount, gross_amount, assigned_seller_id")
          .eq("is_reactivation", true)
          .gte("converted_at", from.toISOString())
          .lte("converted_at", to.toISOString())
          .order("converted_at", { ascending: false }),
        recoveryMetricIds.length
          ? supabase
              .from("tactical_manual_entries")
              .select("id, user_id, entry_date, value, mrr_value, note, metric_id, entry_kind, recovery_channel, reason_id")
              .in("metric_id", recoveryMetricIds)
              .gte("entry_date", toBRDateKey(from))
              .lte("entry_date", toBRDateKey(to))
              .order("entry_date", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("tactical_recoveries")
          .select("id, customer_name, customer_email, plan_name, seller_id, recovered_at, price, mrr, note, source, entry_kind, recovery_channel, reason_id")
          .gte("recovered_at", toBRDateKey(from))
          .lte("recovered_at", toBRDateKey(to))
          .order("recovered_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const list: Row[] = (convRes.data || [])
        .filter((c: any) => !memberIds.length || memberIds.includes(c.assigned_seller_id))
        .map((c: any) => ({
          id: `s-${c.id}`,
          email: c.customer_email,
          name: null as string | null,
          plan: c.plan_name || c.product_name,
          date: c.converted_at,
          price: Number(c.net_amount ?? c.gross_amount ?? 0),
          mrr: Number(c.mrr_net ?? c.mrr ?? 0),
          seller_id: c.assigned_seller_id,
          origin: "stripe" as const,
          qty: 1,
          entryKind: "recovered" as const,
          channel: "cobranca" as RecoveryChannel,
          reasonId: null as string | null,
        }))
        .filter((r) => r.mrr > 0);

      for (const m of (manualRes as any).data || []) {
        if (memberIds.length && !memberIds.includes(m.user_id)) continue;
        list.push({
          id: `m-${m.id}`,
          email: null,
          name: m.note || "Lançamento manual",
          plan: null,
          date: m.entry_date,
          price: 0,
          mrr: Number(m.mrr_value || 0),
          seller_id: m.user_id,
          origin: "manual",
          qty: Number(m.value || 0),
          entryKind: m.entry_kind === "retained" ? "retained" : "recovered",
          rawId: m.id,
          kind: "manual_entry",
          note: m.note,
          channel: (m.recovery_channel === "cobranca" ? "cobranca" : "cs") as RecoveryChannel,
          reasonId: m.reason_id ?? null,
        });
      }

      for (const r of (recRes as any).data || []) {
        if (memberIds.length && r.seller_id && !memberIds.includes(r.seller_id)) continue;
        list.push({
          id: `r-${r.id}`,
          email: r.customer_email,
          name: r.customer_name,
          plan: r.plan_name,
          date: r.recovered_at,
          price: Number(r.price || 0),
          mrr: Number(r.mrr || 0),
          seller_id: r.seller_id,
          origin: r.source === "import" ? "import" : "manual",
          qty: 1,
          entryKind: r.entry_kind === "retained" ? "retained" : "recovered",
          rawId: r.id,
          kind: "recovery",
          note: r.note,
          channel: (r.recovery_channel === "cobranca" ? "cobranca" : "cs") as RecoveryChannel,
          reasonId: r.reason_id ?? null,
        });

      }

      const emails = Array.from(new Set(list.map((r) => r.email).filter(Boolean))) as string[];
      if (emails.length) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("name, email")
          .in("email", emails.slice(0, 500));
        const byEmail = new Map((contacts || []).map((c: any) => [String(c.email).toLowerCase(), c.name]));
        for (const r of list) {
          if (r.email) r.name = byEmail.get(r.email.toLowerCase()) ?? r.name;
        }
      }

      list.sort((a, b) => parseDateBR(b.date).getTime() - parseDateBR(a.date).getTime());

      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days, memberIds.join(","), recoveryMetricIds.join(","), today.getTime(), refreshKey, localRefresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (kindFilter !== "all") list = list.filter((r) => r.entryKind === kindFilter);
    if (channelFilter !== "all") list = list.filter((r) => r.channel === channelFilter);
    if (reasonFilter !== "all") list = list.filter((r) => (r.reasonId || "none") === reasonFilter);
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.email || "").toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.plan || "").toLowerCase().includes(q),
    );
  }, [rows, query, kindFilter, channelFilter, reasonFilter]);

  // Pendências de classificação (registros editáveis sem motivo declarado)
  const pendingCount = useMemo(() => rows.filter((r) => r.rawId && !r.reasonId).length, [rows]);
  const selectableFiltered = useMemo(() => filtered.filter((r) => r.rawId), [filtered]);
  const selectedRows = useMemo(() => selectableFiltered.filter((r) => selected[r.id]), [selectableFiltered, selected]);
  const allSelected = selectableFiltered.length > 0 && selectedRows.length === selectableFiltered.length;
  const bulkTargets: BulkTarget[] = useMemo(
    () =>
      selectedRows.map((r) => ({
        rawId: r.rawId as string,
        table: r.kind === "manual_entry" ? "tactical_manual_entries" : "tactical_recoveries",
        channel: r.channel,
      })),
    [selectedRows],
  );

  useEffect(() => {
    setSelected({});
  }, [rows]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, true> = {};
    for (const r of selectableFiltered) next[r.id] = true;
    setSelected(next);
  }

  function showPendingOnly() {
    setReasonFilter("none");
    setKindFilter("all");
    setChannelFilter("all");
    setQuery("");
    setOpen(true);
  }



  const totalMrr = filtered.reduce((s, r) => s + r.mrr, 0);
  const totalQty = filtered.reduce((s, r) => s + r.qty, 0);
  const recoveredQty = filtered.filter((r) => r.entryKind === "recovered").reduce((s, r) => s + r.qty, 0);
  const retainedQty = filtered.filter((r) => r.entryKind === "retained").reduce((s, r) => s + r.qty, 0);

  const byChannel = useMemo(() => {
    const acc: Record<RecoveryChannel, { qty: number; mrr: number; recovered: number; retained: number }> = {
      cobranca: { qty: 0, mrr: 0, recovered: 0, retained: 0 },
      cs: { qty: 0, mrr: 0, recovered: 0, retained: 0 },
    };
    for (const r of filtered) {
      const a = acc[r.channel];
      a.qty += r.qty;
      a.mrr += r.mrr;
      if (r.entryKind === "retained") a.retained += r.qty;
      else a.recovered += r.qty;
    }
    return acc;
  }, [filtered]);

  const reasonRanking = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; mrr: number }>();
    for (const r of filtered) {
      const key = r.reasonId || "none";
      const name = r.reasonId ? reasonName.get(r.reasonId) || "Motivo removido" : "Sem motivo declarado";
      const cur = map.get(key) || { name, qty: 0, mrr: 0 };
      cur.qty += r.qty;
      cur.mrr += r.mrr;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr || b.qty - a.qty);
  }, [filtered, reasonName]);

  function toEditable(r: Row): EditableRecovery {
    return {
      kind: r.kind === "manual_entry" ? "manual_entry" : "recovery",
      rawId: r.rawId as string,
      customer_name: r.kind === "manual_entry" ? "" : r.name || "",
      customer_email: r.email || "",
      plan_name: r.plan || "",
      seller_id: r.seller_id || "",
      date: String(r.date).slice(0, 10),
      price: r.price ? String(r.price) : "",
      mrr: r.mrr ? String(r.mrr) : "",
      qty: String(r.qty ?? ""),
      note: r.note || "",
      entry_kind: r.entryKind,
      recovery_channel: r.channel,
      reason_id: r.reasonId || "",
    };
  }

  async function handleDelete() {
    if (!deleting?.rawId) return;
    const table = deleting.kind === "manual_entry" ? "tactical_manual_entries" : "tactical_recoveries";
    const { error } = await supabase.from(table as any).delete().eq("id", deleting.rawId);
    setDeleting(null);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registro excluído" });
    setLocalRefresh((k) => k + 1);
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="px-4 md:px-6 flex flex-col items-stretch gap-3 space-y-0 md:flex-row md:items-center md:justify-between md:flex-wrap">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-start gap-2 text-left">
              <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">
                  Clientes recuperados e retidos{teamName ? ` · Time ${teamName}` : ""}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Reativações identificadas no Stripe somadas aos lançamentos manuais do time (recuperados e retidos).
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
            <Input
              placeholder="Buscar cliente, e-mail ou plano..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="col-span-2 h-10 md:h-8 md:w-56"
            />
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-10 md:h-8 md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="recovered">Recuperados</SelectItem>
                <SelectItem value="retained">Retidos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as typeof channelFilter)}>
              <SelectTrigger className="h-10 md:h-8 md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                <SelectItem value="cobranca">{CHANNEL_LABEL.cobranca}</SelectItem>
                <SelectItem value="cs">{CHANNEL_LABEL.cs}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="h-10 md:h-8 md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motivos</SelectItem>
                <SelectItem value="none">Sem motivo declarado</SelectItem>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-10 md:h-8 md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="justify-center">{recoveredQty} recuperados</Badge>
            <Badge variant="outline" className="justify-center">{retainedQty} retidos</Badge>
            {pendingCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="col-span-2 h-9 md:h-8 md:col-auto text-amber-600 border-amber-500/50"
                onClick={showPendingOnly}
              >
                <ListChecks className="h-3.5 w-3.5 mr-1" />
                {pendingCount} sem motivo
              </Button>
            )}

            <div className="col-span-2 md:col-auto">
              <RecoveryEntryDialog
                onReasonsChanged={reloadReasons}
                profiles={profiles}
                reasons={reasons}
                memberIds={memberIds}
                today={today}
                onSaved={() => setLocalRefresh((k) => k + 1)}
              />
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
      <CardContent className="px-3 sm:px-4 md:px-6">

        <div className="grid gap-2 sm:grid-cols-2 mb-3">
          {(["cobranca", "cs"] as RecoveryChannel[]).map((ch) => (
            <div key={ch} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  Via {CHANNEL_LABEL[ch]}
                  <span className="text-muted-foreground font-normal">
                    {ch === "cobranca" ? " · cobrança forçada no Stripe" : " · ação do time"}
                  </span>
                </p>
                <p className="text-sm font-semibold">{fmtBRL(byChannel[ch].mrr)}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {byChannel[ch].qty} clientes · {byChannel[ch].recovered} recuperados · {byChannel[ch].retained} retidos
              </p>
            </div>
          ))}
        </div>

        {reasonRanking.length > 0 && (
          <div className="rounded-lg border p-3 mb-3">
            <p className="text-xs font-medium mb-2">Motivos no período</p>
            <div className="space-y-1">
              {reasonRanking.slice(0, 6).map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {r.qty} · {fmtBRL(r.mrr)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectableFiltered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 mb-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos os visíveis" />
              Selecionar todos os visíveis ({selectableFiltered.length})
            </label>
            <span className="text-xs text-muted-foreground">
              {selectedRows.length} selecionado{selectedRows.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              className="h-8 ml-auto"
              disabled={selectedRows.length === 0}
              onClick={() => setBulkOpen(true)}
            >
              Definir canal/motivo
            </Button>
          </div>
        )}

        {loading ? (

          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum registro no período para este time.
          </p>
        ) : (
          <>
          <div className="md:hidden space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {r.rawId && (
                      <Checkbox
                        className="mt-0.5"
                        checked={!!selected[r.id]}
                        onCheckedChange={() => toggleRow(r.id)}
                        aria-label="Selecionar registro"
                      />
                    )}
                    <p className="text-sm font-medium truncate">{r.name || r.email || "—"}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0">{r.mrr > 0 ? fmtBRL(r.mrr) : "—"}</p>
                </div>

                {r.name && r.email && <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={r.entryKind === "retained" ? "default" : "secondary"} className="text-[10px]">
                    {r.entryKind === "retained" ? "Retido" : "Recuperado"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {CHANNEL_LABEL[r.channel]}
                  </Badge>
                  {r.origin !== "stripe" && (
                    <Badge variant="outline" className="text-[10px]">
                      {r.origin === "import" ? "Importado" : "Manual"}
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {parseDateBR(r.date).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {r.plan || "—"} · {profiles.find((p) => p.user_id === r.seller_id)?.full_name || "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Motivo: {r.reasonId ? reasonName.get(r.reasonId) || "—" : "—"}
                </p>
                {r.rawId && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="h-9 flex-1" onClick={() => setEditing(toEditable(r))}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 flex-1 text-destructive"
                      onClick={() => setDeleting(toEditable(r))}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm font-semibold">
              <span>Total ({totalQty})</span>
              <span>{fmtBRL(totalMrr)}</span>
            </div>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <Table>

              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                  </TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right w-[90px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} data-state={selected[r.id] ? "selected" : undefined}>
                    <TableCell>
                      {r.rawId && (
                        <Checkbox
                          checked={!!selected[r.id]}
                          onCheckedChange={() => toggleRow(r.id)}
                          aria-label="Selecionar registro"
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">

                      {r.name || "—"}
                      {r.origin !== "stripe" && (
                        <Badge variant="outline" className="ml-2">
                          {r.origin === "import" ? "Importado" : "Manual"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                    <TableCell>{r.plan || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.entryKind === "retained" ? "default" : "secondary"}>
                        {r.entryKind === "retained" ? "Retido" : "Recuperado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{CHANNEL_LABEL[r.channel]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">
                      {r.reasonId ? reasonName.get(r.reasonId) || "—" : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {profiles.find((p) => p.user_id === r.seller_id)?.full_name || "—"}
                    </TableCell>
                    <TableCell>{parseDateBR(r.date).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{r.price > 0 ? fmtBRL(r.price) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{r.mrr > 0 ? fmtBRL(r.mrr) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.rawId ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Editar registro"
                            onClick={() => setEditing(toEditable(r))}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            aria-label="Excluir registro"
                            onClick={() => setDeleting(toEditable(r))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Stripe</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell colSpan={9}>Total ({totalQty})</TableCell>
                  <TableCell className="text-right">{fmtBRL(totalMrr)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
          </>

        )}
        <div className="mt-4">
          <RecoveryReasonsConfig reasons={reasons} onChanged={reloadReasons} />
        </div>
      </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <RecoveryEditDialog
        onReasonsChanged={reloadReasons}
        entry={editing}
        profiles={profiles}
        reasons={reasons}
        onClose={() => setEditing(null)}
        onSaved={() => setLocalRefresh((k) => k + 1)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o lançamento de cliente recuperado e recalcula os painéis. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );

}
