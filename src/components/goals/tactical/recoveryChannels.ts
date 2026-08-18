import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RecoveryChannel = "cobranca" | "cs";

export interface RecoveryReason {
  id: string;
  name: string;
  channel: "cobranca" | "cs" | "ambos";
  active: boolean;
  sort_order: number;
}

export const CHANNEL_LABEL: Record<RecoveryChannel, string> = {
  cobranca: "Cobrança",
  cs: "CS",
};

export function parseChannel(v: unknown, fallback: RecoveryChannel = "cs"): RecoveryChannel {
  const s = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return fallback;
  if (s.includes("cobr") || s.includes("billing") || s.includes("stripe") || s.includes("retentativa")) return "cobranca";
  if (s.includes("cs") || s.includes("sucesso") || s.includes("atendimento")) return "cs";
  return fallback;
}

export function reasonsForChannel(reasons: RecoveryReason[], channel: RecoveryChannel) {
  return reasons.filter((r) => r.active && (r.channel === "ambos" || r.channel === channel));
}

export function useRecoveryReasons() {
  const [reasons, setReasons] = useState<RecoveryReason[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tactical_recovery_reasons")
      .select("id, name, channel, active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    setReasons((data || []) as RecoveryReason[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reasons, loading, reload };
}
