import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Tag = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_system: boolean;
  description: string | null;
};

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, slug, color, is_system, description")
        .order("name");
      if (error) throw error;
      return (data || []) as Tag[];
    },
    staleTime: 60_000,
  });
}

export function useOpportunityTags(opportunityIds: string[] | undefined) {
  return useQuery({
    queryKey: ["opportunity_tags", opportunityIds?.sort().join(",")],
    enabled: !!opportunityIds && opportunityIds.length > 0,
    queryFn: async () => {
      if (!opportunityIds || opportunityIds.length === 0) return {};
      const { data, error } = await supabase
        .from("opportunity_tags")
        .select("opportunity_id, tag_id")
        .in("opportunity_id", opportunityIds);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        if (!map[row.opportunity_id]) map[row.opportunity_id] = [];
        map[row.opportunity_id].push(row.tag_id);
      });
      return map;
    },
  });
}

export function useAddTagToOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, tagId }: { opportunityId: string; tagId: string }) => {
      const { error } = await supabase
        .from("opportunity_tags")
        .upsert(
          { opportunity_id: opportunityId, tag_id: tagId },
          { onConflict: "opportunity_id,tag_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity_tags"] });
    },
  });
}

export function useRemoveTagFromOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, tagId }: { opportunityId: string; tagId: string }) => {
      const { error } = await supabase
        .from("opportunity_tags")
        .delete()
        .eq("opportunity_id", opportunityId)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity_tags"] });
    },
  });
}
