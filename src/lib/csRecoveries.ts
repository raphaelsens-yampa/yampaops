/**
 * Recuperações do CS que contam no New MRR (regra única para todas as telas):
 * só `entry_kind = recovered` (Retido nunca conta) e só quando o cliente NÃO
 * estava na foto de ativos pagantes anterior à recuperação (MRR efetivamente novo).
 * Somam-se às reativações pagas da Stripe em "Recuperados".
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "./supabasePaged";
import { classifyRecoveries, normEmail } from "./recoveryReconciliation";
import type { OriginFilter } from "./origins";

export interface CsRecovery { id: string; day: string; mrr: number; email: string | null; origin: "yampa" | "4blue"; sellerId: string | null }

export const csRecoveryOrigin = (o: string | null | undefined): "yampa" | "4blue" =>
  String(o || "").toLowerCase().includes("4blue") ? "4blue" : "yampa";

export const sumCsRecoveries = (rows: CsRecovery[], from: string, to: string, origin: OriginFilter = "all") =>
  rows.filter((r) => r.day >= from && r.day <= to && (origin === "all" || r.origin === origin)).reduce((a, r) => a + r.mrr, 0);

/** Recuperações oficiais (todas as origens) entre duas datas YYYY-MM-DD. */
export async function fetchOfficialCsRecoveries(from: string, to: string): Promise<CsRecovery[]> {
  const { data: recs, error } = await fetchAllPaged<any>(() =>
    supabase.from("tactical_recoveries").select("id,customer_email,recovered_at,mrr,entry_kind,origem_cliente,seller_id")
      .eq("entry_kind", "recovered").gte("recovered_at", from).lte("recovered_at", to).order("id") as any);
  if (error) throw new Error(error);
  if (!recs.length) return [];
  const recDays = [...new Set(recs.map((r) => String(r.recovered_at).slice(0, 10)))];
  const baseByDay = new Map<string, string | null>();
  await Promise.all(recDays.map(async (d) => {
    const { data: s } = await supabase.from("metas_ativos_pagantes_daily").select("data_snapshot")
      .lt("data_snapshot", d).order("data_snapshot", { ascending: false }).limit(1);
    baseByDay.set(d, (s?.[0] as any)?.data_snapshot ?? null);
  }));
  const baseOf = (d: string) => baseByDay.get(d) ?? null;
  const baseDates = [...new Set(recs.map((r) => baseOf(String(r.recovered_at).slice(0, 10))).filter(Boolean))] as string[];
  const emails = [...new Set(recs.flatMap((r) => [normEmail(r.customer_email), String(r.customer_email ?? "").trim()]).filter(Boolean))];
  const active = new Map<string, Set<string>>();
  for (let i = 0; baseDates.length && i < emails.length; i += 100) {
    const { data: rows, error: e2 } = await fetchAllPaged<any>(() =>
      supabase.from("metas_ativos_pagantes_daily").select("id,email,data_snapshot").in("data_snapshot", baseDates)
        .in("email", emails.slice(i, i + 100)).eq("status_assinatura", "ativo").order("id") as any);
    if (e2) throw new Error(e2);
    for (const row of rows) { const s = active.get(row.data_snapshot) ?? new Set<string>(); s.add(normEmail(row.email)); active.set(row.data_snapshot, s); }
  }
  const byId = new Map(recs.map((r) => [r.id, r]));
  const recon = classifyRecoveries(
    recs.map((r) => ({ id: r.id, email: r.customer_email, recoveredAt: String(r.recovered_at).slice(0, 10), mrr: Number(r.mrr) || 0 })),
    baseOf, active);
  return recon.rows.filter((r) => r.status === "official").map((r) => {
    const src = byId.get(r.id);
    return { id: r.id, day: r.recoveredAt, mrr: r.mrr, email: r.email, origin: csRecoveryOrigin(src?.origem_cliente), sellerId: src?.seller_id ?? null };
  });
}
