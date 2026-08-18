import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toBRDateKey } from "./types";
import type { RecoveryChannel, RecoveryReason } from "./recoveryChannels";

/**
 * Leitura única do recorte por canal (Cobrança x CS) e motivo das
 * recuperações/retenções, consumida pelos painéis táticos (visão geral,
 * missão do dia, gráfico por canal, ranking de motivos e placar do time).
 *
 * Fontes:
 *  - `stripe_conversions` (is_reactivation) => canal Cobrança derivado.
 *  - `tactical_recoveries` (manual/import) => canal e motivo declarados.
 *  - `tactical_manual_entries` das métricas de recuperados/retidos (agregados).
 */

/** `null` = registro ainda não classificado (canal ausente na base). */
export type ChannelValue = RecoveryChannel | null;

export interface RecoveryChannelRow {
  id: string;
  rawId?: string;
  table?: "tactical_recoveries" | "tactical_manual_entries";
  dateKey: string;
  sellerId: string | null;
  channel: ChannelValue;
  reasonId: string | null;
  entryKind: "recovered" | "retained";
  qty: number;
  mrr: number;
  origin: "stripe" | "manual" | "import";
}

export interface ChannelTotals {
  qty: number;
  mrr: number;
  recovered: number;
  retained: number;
}

export interface ChannelSummary {
  cobranca: ChannelTotals;
  cs: ChannelTotals;
  unclassified: ChannelTotals;
  total: ChannelTotals;
  /** registros sem motivo declarado (ignora reativações automáticas do Stripe) */
  missingReason: number;
  /** registros sem canal definido */
  missingChannel: number;
}

const EMPTY: ChannelTotals = { qty: 0, mrr: 0, recovered: 0, retained: 0 };

function emptyTotals(): ChannelTotals {
  return { ...EMPTY };
}

export function normalizeChannelValue(v: unknown): ChannelValue {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "cobranca" || s === "cobrança") return "cobranca";
  if (s === "cs") return "cs";
  return null;
}

export function summarizeChannels(rows: RecoveryChannelRow[]): ChannelSummary {
  const out: ChannelSummary = {
    cobranca: emptyTotals(),
    cs: emptyTotals(),
    unclassified: emptyTotals(),
    total: emptyTotals(),
    missingReason: 0,
    missingChannel: 0,
  };
  for (const r of rows) {
    const bucket = r.channel === "cobranca" ? out.cobranca : r.channel === "cs" ? out.cs : out.unclassified;
    for (const b of [bucket, out.total]) {
      b.qty += r.qty;
      b.mrr += r.mrr;
      if (r.entryKind === "retained") b.retained += r.qty;
      else b.recovered += r.qty;
    }
    if (!r.channel) out.missingChannel += 1;
    if (!r.reasonId && r.origin !== "stripe") out.missingReason += 1;
  }
  return out;
}

export interface ReasonRank {
  key: string;
  name: string;
  qty: number;
  mrr: number;
  recovered: number;
  retained: number;
}

export function rankReasons(
  rows: RecoveryChannelRow[],
  reasons: RecoveryReason[],
): ReasonRank[] {
  const names = new Map(reasons.map((r) => [r.id, r.name]));
  const map = new Map<string, ReasonRank>();
  for (const r of rows) {
    const key = r.reasonId || "none";
    const name = r.reasonId
      ? names.get(r.reasonId) || "Motivo removido"
      : r.origin === "stripe"
        ? "Reativação automática (Stripe)"
        : "Sem motivo declarado";
    const cur = map.get(key + name) || { key, name, qty: 0, mrr: 0, recovered: 0, retained: 0 };
    cur.qty += r.qty;
    cur.mrr += r.mrr;
    if (r.entryKind === "retained") cur.retained += r.qty;
    else cur.recovered += r.qty;
    map.set(key + name, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr || b.qty - a.qty);
}

export interface ChannelDayPoint {
  date: string;
  label: string;
  cobranca: number;
  cs: number;
  unclassified: number;
}

/** Série diária empilhada por canal (quantidade ou MRR). */
export function channelDailySeries(
  rows: RecoveryChannelRow[],
  dates: string[],
  measure: "qty" | "mrr",
): ChannelDayPoint[] {
  const acc = new Map<string, ChannelDayPoint>();
  for (const d of dates) {
    acc.set(d, {
      date: d,
      label: d.slice(8, 10) + "/" + d.slice(5, 7),
      cobranca: 0,
      cs: 0,
      unclassified: 0,
    });
  }
  for (const r of rows) {
    const p = acc.get(r.dateKey);
    if (!p) continue;
    const v = measure === "mrr" ? r.mrr : r.qty;
    if (r.channel === "cobranca") p.cobranca += v;
    else if (r.channel === "cs") p.cs += v;
    else p.unclassified += v;
  }
  return Array.from(acc.values());
}

export interface SellerChannelTotals {
  cobrancaMrr: number;
  csMrr: number;
  cobrancaQty: number;
  csQty: number;
}

export function channelsBySeller(rows: RecoveryChannelRow[]): Map<string, SellerChannelTotals> {
  const out = new Map<string, SellerChannelTotals>();
  for (const r of rows) {
    const key = r.sellerId ?? "sem-vendedor";
    const cur = out.get(key) ?? { cobrancaMrr: 0, csMrr: 0, cobrancaQty: 0, csQty: 0 };
    if (r.channel === "cobranca") {
      cur.cobrancaMrr += r.mrr;
      cur.cobrancaQty += r.qty;
    } else if (r.channel === "cs") {
      cur.csMrr += r.mrr;
      cur.csQty += r.qty;
    }
    out.set(key, cur);
  }
  return out;
}

export function useRecoveryChannelData(
  from: Date,
  to: Date,
  memberIds: string[],
  refreshKey = 0,
) {
  const [rows, setRows] = useState<RecoveryChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const memberKey = memberIds.join(",");
  const fromKey = toBRDateKey(from);
  const toKey = toBRDateKey(to);

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date(`${fromKey}T00:00:00`);
    const end = new Date(`${toKey}T23:59:59`);

    const metricRes = await supabase
      .from("tactical_metrics")
      .select("id, key")
      .in("key", ["clientes_recuperados", "clientes_retidos"]);
    const metricIds = (metricRes.data || []).map((m: any) => m.id);

    const [convRes, recRes, manualRes] = await Promise.all([
      supabase
        .from("stripe_conversions")
        .select("id, converted_at, mrr, mrr_net, assigned_seller_id")
        .eq("is_reactivation", true)
        .gte("converted_at", start.toISOString())
        .lte("converted_at", end.toISOString()),
      supabase
        .from("tactical_recoveries")
        .select("id, seller_id, recovered_at, mrr, entry_kind, recovery_channel, reason_id, source")
        .gte("recovered_at", fromKey)
        .lte("recovered_at", toKey),
      metricIds.length
        ? supabase
            .from("tactical_manual_entries")
            .select("id, user_id, entry_date, value, mrr_value, entry_kind, recovery_channel, reason_id")
            .in("metric_id", metricIds)
            .gte("entry_date", fromKey)
            .lte("entry_date", toKey)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const allowed = new Set(memberIds);
    const list: RecoveryChannelRow[] = [];

    for (const c of (convRes.data as any[]) || []) {
      if (allowed.size && !allowed.has(c.assigned_seller_id)) continue;
      const mrr = Number(c.mrr_net ?? c.mrr ?? 0);
      if (mrr <= 0) continue;
      list.push({
        id: `s-${c.id}`,
        dateKey: toBRDateKey(new Date(c.converted_at)),
        sellerId: c.assigned_seller_id ?? null,
        channel: "cobranca",
        reasonId: null,
        entryKind: "recovered",
        qty: 1,
        mrr,
        origin: "stripe",
      });
    }

    for (const r of (recRes.data as any[]) || []) {
      if (allowed.size && r.seller_id && !allowed.has(r.seller_id)) continue;
      list.push({
        id: `r-${r.id}`,
        rawId: r.id,
        table: "tactical_recoveries",
        dateKey: String(r.recovered_at).slice(0, 10),
        sellerId: r.seller_id ?? null,
        channel: normalizeChannelValue(r.recovery_channel),
        reasonId: r.reason_id ?? null,
        entryKind: r.entry_kind === "retained" ? "retained" : "recovered",
        qty: 1,
        mrr: Number(r.mrr || 0),
        origin: r.source === "import" ? "import" : "manual",
      });
    }

    for (const m of (manualRes as any).data || []) {
      if (allowed.size && !allowed.has(m.user_id)) continue;
      list.push({
        id: `m-${m.id}`,
        rawId: m.id,
        table: "tactical_manual_entries",
        dateKey: String(m.entry_date).slice(0, 10),
        sellerId: m.user_id ?? null,
        channel: normalizeChannelValue(m.recovery_channel),
        reasonId: m.reason_id ?? null,
        entryKind: m.entry_kind === "retained" ? "retained" : "recovered",
        qty: Number(m.value || 0),
        mrr: Number(m.mrr_value || 0),
        origin: "manual",
      });
    }

    setRows(list);
    setLoading(false);
  }, [fromKey, toKey, memberKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  const helpers = useMemo(
    () => ({
      inRange: (start: string, end: string) => rows.filter((r) => r.dateKey >= start && r.dateKey <= end),
    }),
    [rows],
  );

  return { rows, loading, reload: load, ...helpers };
}
