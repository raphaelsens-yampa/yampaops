import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CsContactLog } from "@/lib/csPortfolio";

/** Visão 360 de um cliente da carteira: conversas, auditorias, temas, funis e histórico de contatos. */
export function useCsClient360(email: string | null, portfolioId: string | null) {
  return useQuery({
    queryKey: ["cs-client-360", email, portfolioId],
    enabled: !!email,
    queryFn: async () => {
      const em = (email || "").toLowerCase();

      const [convRes, logsRes, dealsRes, csatRes] = await Promise.all([
        supabase
          .from("chatwoot_conversations")
          .select("conversation_id, status, created_at_cw, last_activity_at, assignee_name, inbox_name, tabulation, labels")
          .eq("contact_email", em)
          .order("last_activity_at", { ascending: false })
          .limit(25),
        portfolioId
          ? supabase
              .from("cs_contact_logs")
              .select("*")
              .eq("portfolio_id", portfolioId)
              .order("contacted_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("ac_funnel_deals")
          .select("ac_deal_id, title, stage_title, funnel_title, owner_name, status, value, updated_at")
          .eq("contact_email", em)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("chatwoot_csat_responses")
          .select("rating, feedback, created_at_cw")
          .eq("contact_email", em)
          .order("created_at_cw", { ascending: false })
          .limit(10),
      ]);

      const convIds = (convRes.data || []).map((c: any) => c.conversation_id);

      const [auditRes, themeRes] = await Promise.all([
        convIds.length
          ? supabase
              .from("chatwoot_conversation_audits")
              .select("conversation_id, summary, churn_risk, severity, sentiment, created_at")
              .in("conversation_id", convIds)
          : Promise.resolve({ data: [], error: null } as any),
        convIds.length
          ? supabase
              .from("chatwoot_conversation_themes")
              .select("conversation_id, canonical_theme, main_pain, sentiment, urgency, summary, keywords")
              .in("conversation_id", convIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const audits = new Map<number, any>();
      for (const a of auditRes.data || []) audits.set(Number((a as any).conversation_id), a);
      const themes = new Map<number, any>();
      for (const t of themeRes.data || []) themes.set(Number((t as any).conversation_id), t);

      return {
        conversations: (convRes.data || []).map((c: any) => ({
          ...c,
          audit: audits.get(Number(c.conversation_id)) || null,
          theme: themes.get(Number(c.conversation_id)) || null,
        })),
        logs: ((logsRes as any).data || []) as CsContactLog[],
        deals: ((dealsRes as any).data || []) as any[],
        csat: ((csatRes as any).data || []) as any[],
      };
    },
  });
}
