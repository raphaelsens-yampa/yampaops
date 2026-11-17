import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CsTask } from "@/lib/csTasks";

export function useCsTasks(email?: string | null) {
  return useQuery({
    queryKey: ["cs-tasks", email ?? "all"],
    queryFn: async () => {
      const all: CsTask[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase.from("cs_tasks").select("*").order("due_at").order("id").range(from, from + 999);
        if (email) q = q.eq("client_email", email.toLowerCase());
        const { data, error } = await q;
        if (error) throw error;
        all.push(...((data || []) as CsTask[]));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });
}

export function useCsTaskMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["cs-tasks"] });
  const save = useMutation({
    mutationFn: async (t: Partial<CsTask>) => {
      const payload: any = { ...t };
      if (payload.client_email) payload.client_email = payload.client_email.trim().toLowerCase();
      if (payload.status) payload.completed_at = payload.status === "concluida" ? (t.completed_at || new Date().toISOString()) : null;
      const { error } = t.id
        ? await supabase.from("cs_tasks").update(payload).eq("id", t.id)
        : await supabase.from("cs_tasks").insert(payload);
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("cs_tasks").delete().eq("id", id); if (error) throw error; },
    onSuccess: done,
  });
  return { save, remove };
}
