import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useChatwootIntegration() {
  const q = useQuery({
    queryKey: ["chatwoot-integration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("chatwoot_base_url, chatwoot_account_id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const buildConversationUrl = (conversationId: number | string): string | null => {
    if (!q.data?.chatwoot_base_url || !q.data?.chatwoot_account_id) return null;
    const base = String(q.data.chatwoot_base_url).replace(/\/$/, "");
    return `${base}/app/accounts/${q.data.chatwoot_account_id}/conversations/${conversationId}`;
  };

  return { ...q, buildConversationUrl };
}
