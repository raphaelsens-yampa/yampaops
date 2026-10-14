import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";

export type CsTag = { id: string; name: string; color: string };

export function useCsTags() {
  return useQuery({
    queryKey: ["cs-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cs_tags").select("id, name, color").order("name");
      if (error) throw error;
      return (data || []) as CsTag[];
    },
  });
}

/** Mapa e-mail (minúsculo) → ids de tags. */
export function useCsClientTags() {
  return useQuery({
    queryKey: ["cs-client-tags"],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<{ email: string; tag_id: string }>(
        () => supabase.from("cs_client_tags").select("email, tag_id").order("email").order("tag_id") as any,
      );
      if (error) throw new Error(error);
      const map: Record<string, string[]> = {};
      data.forEach((r) => {
        const k = r.email.toLowerCase();
        (map[k] ||= []).push(r.tag_id);
      });
      return map;
    },
  });
}

export function useCsTagMutations() {
  const qc = useQueryClient();
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["cs-tags"] });
    qc.invalidateQueries({ queryKey: ["cs-client-tags"] });
  };
  const create = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("cs_tags")
        .insert({ name: name.trim(), color, created_by: u.user?.id ?? null })
        .select("id, name, color")
        .single();
      if (error) throw error;
      return data as CsTag;
    },
    onSuccess: inval,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cs_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: inval,
  });
  const attach = useMutation({
    mutationFn: async ({ emails, tagId }: { emails: string[]; tagId: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const rows = Array.from(new Set(emails.map((e) => e.toLowerCase()))).map((email) => ({
        email, tag_id: tagId, created_by: u.user?.id ?? null,
      }));
      const { error } = await supabase
        .from("cs_client_tags")
        .upsert(rows, { onConflict: "email,tag_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: inval,
  });
  const detach = useMutation({
    mutationFn: async ({ email, tagId }: { email: string; tagId: string }) => {
      const { error } = await supabase
        .from("cs_client_tags").delete().eq("email", email.toLowerCase()).eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: inval,
  });
  return { create, remove, attach, detach };
}
