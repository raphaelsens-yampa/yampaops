import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { matchesOrigin, isOriginFiltered, type OriginFilter } from "@/lib/origins";
import { classifyRecoveries, normEmail, type RecoveryReconciliation } from "@/lib/recoveryReconciliation";

/** Confere as recuperações do período com a foto de ativos pagantes anterior a cada uma. */
export function useRecoveryReconciliation(
  fromKey: string,
  toKey: string,
  memberIds: string[],
  origin: OriginFilter,
  refreshKey = 0,
) {
  const [data, setData] = useState<RecoveryReconciliation | null>(null);
  const membersKey = memberIds.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: recs, error } = await fetchAllPaged<any>(() =>
        supabase
          .from("tactical_recoveries")
          .select("id,customer_email,customer_name,recovered_at,mrr,entry_kind,origem_cliente,seller_id")
          .eq("entry_kind", "recovered")
          .gte("recovered_at", fromKey)
          .lte("recovered_at", toKey)
          .order("id") as any,
      );
      if (error || cancelled) return;
      const members = new Set(memberIds);
      const list = recs.filter(
        (r) => members.has(r.seller_id) && (!isOriginFiltered(origin) || matchesOrigin(r.origem_cliente, origin)),
      );
      const dates = [...new Set(list.map((r) => String(r.recovered_at).slice(0, 10)))];
      const baseByDate = new Map<string, string | null>();
      await Promise.all(
        dates.map(async (d) => {
          const { data: s } = await supabase
            .from("metas_ativos_pagantes_daily")
            .select("data_snapshot")
            .lt("data_snapshot", d)
            .order("data_snapshot", { ascending: false })
            .limit(1);
          baseByDate.set(d, (s?.[0] as any)?.data_snapshot ?? null);
        }),
      );
      const baseDates = [...new Set([...baseByDate.values()].filter(Boolean))] as string[];
      const emails = [
        ...new Set(list.flatMap((r) => [normEmail(r.customer_email), String(r.customer_email ?? "").trim()]).filter(Boolean)),
      ];
      const active = new Map<string, Set<string>>();
      if (baseDates.length && emails.length) {
        for (let i = 0; i < emails.length; i += 100) {
          const chunk = emails.slice(i, i + 100);
          const { data: rows } = await fetchAllPaged<any>(() =>
            supabase
              .from("metas_ativos_pagantes_daily")
              .select("id,email,data_snapshot")
              .in("data_snapshot", baseDates)
              .in("email", chunk)
              .eq("status_assinatura", "ativo")
              .order("id") as any,
          );
          for (const row of rows) {
            const set = active.get(row.data_snapshot) ?? new Set<string>();
            set.add(normEmail(row.email));
            active.set(row.data_snapshot, set);
          }
        }
      }
      if (cancelled) return;
      setData(
        classifyRecoveries(
          list.map((r) => ({
            id: r.id,
            email: r.customer_email,
            name: r.customer_name,
            sellerId: r.seller_id,
            recoveredAt: String(r.recovered_at).slice(0, 10),
            mrr: Number(r.mrr) || 0,
          })),
          (d) => baseByDate.get(d) ?? null,
          active,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, membersKey, origin, refreshKey]);

  return data;
}
