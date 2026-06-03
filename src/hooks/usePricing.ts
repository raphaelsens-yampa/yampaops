import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PricingSnapshot, PricingVersionRow } from "@/lib/pricing/types";
import { emptySnapshot } from "@/lib/pricing/engine";
import { toast } from "@/hooks/use-toast";

export function usePricingVersions() {
  return useQuery({
    queryKey: ["pricing-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_versions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PricingVersionRow[];
    },
  });
}

export function useActivePricingVersion() {
  const q = usePricingVersions();
  const active = useMemo(
    () => q.data?.find((v) => v.is_active) ?? q.data?.[0] ?? null,
    [q.data],
  );
  return { ...q, active };
}

/** Editor controlado de uma versão: snapshot local + flush. */
export function useVersionEditor(version: PricingVersionRow | null) {
  const qc = useQueryClient();
  const [snap, setSnap] = useState<PricingSnapshot>(emptySnapshot());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (version) {
      setSnap(version.snapshot ?? emptySnapshot());
      setDirty(false);
    }
  }, [version?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((updater: (s: PricingSnapshot) => PricingSnapshot) => {
    setSnap((prev) => updater(prev));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!version) return;
    setSaving(true);
    const { error } = await supabase
      .from("pricing_versions")
      .update({ snapshot: snap as any })
      .eq("id", version.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setDirty(false);
    toast({ title: "Salvo", description: "Precificação atualizada." });
    qc.invalidateQueries({ queryKey: ["pricing-versions"] });
  }, [snap, version, qc]);

  return { snap, update, dirty, saving, save };
}
