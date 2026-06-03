import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export type SyncPhase = "idle" | "backfill" | "repair" | "cohort" | "done" | "error" | "cancelled";

type SyncState = {
  syncing: boolean;
  phase: SyncPhase;
  phaseLabel: string;
  percent: number;
  elapsedSec: number;
  etaSec: number | null;
  campaignId: string | null;
  campaignName: string | null;
  error: string | null;
};

type Ctx = SyncState & {
  start: (campaignId: string, campaignName?: string) => void;
  cancel: () => void;
  dismiss: () => void;
};

const initial: SyncState = {
  syncing: false,
  phase: "idle",
  phaseLabel: "",
  percent: 0,
  elapsedSec: 0,
  etaSec: null,
  campaignId: null,
  campaignName: null,
  error: null,
};

const CohortSyncCtx = createContext<Ctx | null>(null);

const PHASE_W = { backfill: 45, repair: 45, cohort: 10 };

export function CohortSyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SyncState>(initial);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const percentRef = useRef(0);
  const { toast } = useToast();
  const qc = useQueryClient();

  const patch = useCallback((p: Partial<SyncState>) => {
    setState((s) => ({ ...s, ...p }));
    if (p.percent != null) percentRef.current = p.percent;
  }, []);

  // Ticker for elapsed/ETA
  useEffect(() => {
    if (!state.syncing) return;
    const t = setInterval(() => {
      if (startedAtRef.current == null) return;
      const e = (Date.now() - startedAtRef.current) / 1000;
      const p = percentRef.current;
      setState((s) => ({
        ...s,
        elapsedSec: e,
        etaSec: p > 1 ? (e * (100 - p)) / p : null,
      }));
    }, 1000);
    return () => clearInterval(t);
  }, [state.syncing]);

  const start = useCallback((campaignId: string, campaignName?: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    startedAtRef.current = Date.now();
    percentRef.current = 0;
    setState({
      ...initial,
      syncing: true,
      phase: "backfill",
      phaseLabel: "Backfill de contatos do Chatwoot",
      campaignId,
      campaignName: campaignName || null,
    });

    (async () => {
      try {
        // Phase 1
        let page = 1;
        let totalCw = 0;
        let safety = 0;
        while (safety++ < 300) {
          if (cancelRef.current) throw new Error("__CANCELLED__");
          const { data, error } = await supabase.functions.invoke("chatwoot-contacts-backfill", {
            body: { page_start: page, max_pages: 8, page_size: 25, time_budget_ms: 110000 },
          });
          if (error) throw new Error(`backfill: ${error.message}`);
          const d: any = data || {};
          if (d.total_in_chatwoot) totalCw = d.total_in_chatwoot;
          const processedPages = (d.page_start || page) + (d.pages_processed || 0) - 1;
          const localPct = totalCw > 0 ? Math.min(100, (processedPages * 25 * 100) / totalCw) : 0;
          patch({
            percent: (localPct * PHASE_W.backfill) / 100,
            phaseLabel: `Backfill de contatos (${processedPages * 25}/${totalCw || "?"})`,
          });
          if (d.done || !d.next_page) break;
          page = d.next_page;
        }
        patch({ percent: PHASE_W.backfill, phaseLabel: "Backfill concluído" });

        // Phase 2
        if (cancelRef.current) throw new Error("__CANCELLED__");
        setState((s) => ({ ...s, phase: "repair", phaseLabel: "Reparando conversas do Chatwoot" }));
        const { count: brokenCount } = await supabase
          .from("chatwoot_conversations")
          .select("chatwoot_conversation_id", { count: "exact", head: true })
          .or("chatwoot_contact_id.is.null,and(contact_email.is.null,contact_phone.is.null)");
        const initialBroken = brokenCount || 0;
        let repaired = 0;
        safety = 0;
        while (safety++ < 300) {
          if (cancelRef.current) throw new Error("__CANCELLED__");
          const { data, error } = await supabase.functions.invoke("chatwoot-repair-conversations", {
            body: { batch_size: 40, max_iters: 20, time_budget_ms: 110000 },
          });
          if (error) throw new Error(`repair: ${error.message}`);
          const d: any = data || {};
          repaired += (d.repaired || 0) + (d.skipped || 0);
          const localPct = initialBroken > 0 ? Math.min(100, (repaired * 100) / initialBroken) : 100;
          patch({
            percent: PHASE_W.backfill + (localPct * PHASE_W.repair) / 100,
            phaseLabel: `Reparando conversas (${repaired}/${initialBroken || "?"})`,
          });
          if ((d.fetched || 0) === 0) break;
        }
        patch({ percent: PHASE_W.backfill + PHASE_W.repair, phaseLabel: "Reparo concluído" });

        // Phase 3
        if (cancelRef.current) throw new Error("__CANCELLED__");
        setState((s) => ({ ...s, phase: "cohort", phaseLabel: "Recalculando cohort" }));
        const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("scc_refresh_first_contact", { p_campaign_id: campaignId });
        if (rpcErr) throw new Error(`cohort: ${rpcErr.message}`);
        patch({ percent: 100, phaseLabel: "Concluído" });
        setState((s) => ({ ...s, phase: "done", syncing: false }));
        await qc.invalidateQueries({ queryKey: ["scc-cohort", campaignId] });
        await qc.invalidateQueries({ queryKey: ["scc-overview", campaignId] });
        toast({ title: "Sincronização concluída", description: `${rpcData ?? 0} contato(s) recalculados.` });
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (msg === "__CANCELLED__") {
          setState((s) => ({ ...s, phase: "cancelled", syncing: false, phaseLabel: "Cancelado pelo usuário" }));
          toast({ title: "Sincronização cancelada", description: "Operação interrompida." });
        } else {
          setState((s) => ({ ...s, phase: "error", syncing: false, error: msg }));
          toast({ title: "Erro na sincronização", description: msg, variant: "destructive" });
        }
      } finally {
        runningRef.current = false;
      }
    })();
  }, [patch, qc, toast]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const dismiss = useCallback(() => {
    if (runningRef.current) return;
    setState(initial);
  }, []);

  return (
    <CohortSyncCtx.Provider value={{ ...state, start, cancel, dismiss }}>
      {children}
    </CohortSyncCtx.Provider>
  );
}

export function useCohortSync() {
  const ctx = useContext(CohortSyncCtx);
  if (!ctx) throw new Error("useCohortSync must be used within CohortSyncProvider");
  return ctx;
}
