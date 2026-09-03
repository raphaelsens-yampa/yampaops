import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import type { CsAssignmentRule, CsPortfolioRow, CsSegment, SegmentRule } from "@/lib/csPortfolio";

export function useCsSegments() {
  return useQuery({
    queryKey: ["cs-segments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_segments")
        .select("*")
        .order("priority")
        .order("created_at");
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        rules: Array.isArray(s.rules) ? (s.rules as SegmentRule[]) : [],
      })) as CsSegment[];
    },
  });
}

export function useCsAssignmentRules() {
  return useQuery({
    queryKey: ["cs-assignment-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_assignment_rules")
        .select("*")
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as CsAssignmentRule[];
    },
  });
}

export function useCsPortfolio(includeInactive = false) {
  return useQuery({
    queryKey: ["cs-portfolio", includeInactive],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<CsPortfolioRow>(() => {
        let q = supabase.from("cs_portfolio").select("*").order("email");
        if (!includeInactive) q = q.eq("is_active", true) as typeof q;
        return q as any;
      });
      if (error) throw new Error(error);
      return data;
    },
  });
}

export function useCsAnalysts() {
  return useQuery({
    queryKey: ["cs-analysts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return (data || []) as { user_id: string; full_name: string | null; email: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCsEngagementConfig() {
  return useQuery({
    queryKey: ["cs-engagement-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_engagement_config")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCsPortfolioMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-portfolio"] });
    qc.invalidateQueries({ queryKey: ["cs-segments"] });
  };

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("cs_portfolio_refresh" as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: invalidate,
  });

  const assign = useMutation({
    mutationFn: async ({ ids, csUserId }: { ids: string[]; csUserId: string | null }) => {
      const { error } = await supabase
        .from("cs_portfolio")
        .update({
          cs_user_id: csUserId,
          assignment_source: csUserId ? "manual" : "rule",
          assigned_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const logContact = useMutation({
    mutationFn: async (payload: {
      portfolio_id: string;
      email: string;
      channel: string;
      outcome: string;
      note?: string;
      contacted_at?: string;
      chatwoot_conversation_id?: number | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("cs_contact_logs").insert({
        ...payload,
        author_id: auth.user?.id as string,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["cs-contact-logs"] });
    },
  });

  const saveEnrichment = useMutation({
    mutationFn: async (rows: { email: string; industry?: string | null; notes?: string | null; source?: string }[]) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = rows.map((r) => ({
        email: r.email.trim().toLowerCase(),
        industry: r.industry ?? null,
        notes: r.notes ?? null,
        source: r.source || "manual",
        updated_by: auth.user?.id ?? null,
      }));
      const { error } = await supabase.from("cs_client_enrichment").upsert(payload as any, { onConflict: "email" });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: invalidate,
  });

  return { refresh, assign, logContact, saveEnrichment };
}

export function useCsSegmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-segments"] });
    qc.invalidateQueries({ queryKey: ["cs-assignment-rules"] });
  };

  const saveSegment = useMutation({
    mutationFn: async (s: Partial<CsSegment> & { id?: string }) => {
      const payload = {
        name: s.name,
        color: s.color,
        cadence_days: s.cadence_days,
        rules: s.rules ?? [],
        priority: s.priority ?? 100,
        is_active: s.is_active ?? true,
      };
      if (s.id) {
        const { error } = await supabase.from("cs_segments").update(payload as any).eq("id", s.id);
        if (error) throw error;
        return s.id;
      }
      const { data, error } = await supabase.from("cs_segments").insert(payload as any).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: invalidate,
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cs_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const saveAssignment = useMutation({
    mutationFn: async (r: { id?: string; segment_id: string; mode: string; cs_user_ids: string[]; is_active?: boolean }) => {
      const payload = {
        segment_id: r.segment_id,
        mode: r.mode,
        cs_user_ids: r.cs_user_ids,
        is_active: r.is_active ?? true,
      };
      if (r.id) {
        const { error } = await supabase.from("cs_assignment_rules").update(payload as any).eq("id", r.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("cs_assignment_rules").insert(payload as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cs_assignment_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { saveSegment, deleteSegment, saveAssignment, deleteAssignment };
}

export async function previewSegment(rules: SegmentRule[]) {
  const { data, error } = await supabase.rpc("cs_segment_preview" as any, { p_rules: rules as any });
  if (error) throw error;
  const row = Array.isArray(data) ? (data[0] as any) : (data as any);
  return { count: Number(row?.client_count || 0), mrr: Number(row?.mrr_total || 0) };
}
