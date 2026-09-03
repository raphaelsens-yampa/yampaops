import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CsContactLog } from "@/lib/csPortfolio";

export interface Client360Conversation {
  chatwoot_conversation_id: number;
  status: string | null;
  opened_at: string | null;
  last_message_at: string | null;
  assignee_name: string | null;
  inbox_name: string | null;
  tabulacao_atendimento: string | null;
  labels: string[] | null;
  audit: { summary: string | null; churn_risk_score: number | null; severity: string | null } | null;
  theme: {
    primary_theme_canonical: string | null;
    main_pain: string | null;
    sentiment: string | null;
    urgency: string | null;
    summary: string | null;
    keywords: string[] | null;
  } | null;
}

/** Visão 360 de um cliente da carteira: conversas, auditorias, temas, funis, CSAT e histórico de contatos. */
export function useCsClient360(email: string | null, portfolioId: string | null) {
  return useQuery({
    queryKey: ["cs-client-360", email, portfolioId],
    enabled: !!email,
    queryFn: async () => {
      const em = (email || "").toLowerCase();

      const [convRes, logsRes, dealsRes, csatRes] = await Promise.all([
        // paged-ok: recorte por contato, limitado às 25 conversas mais recentes.
        supabase
          .from("chatwoot_conversations")
          .select(
            "chatwoot_conversation_id, status, opened_at, last_message_at, assignee_name, inbox_name, tabulacao_atendimento, labels",
          )
          .eq("contact_email", em)
          .order("last_message_at", { ascending: false })
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
          .select("ac_deal_id, title, status, value, owner_name, ac_stage_id, ac_group_id, deal_updated_at")
          .eq("contact_email", em)
          .order("deal_updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("chatwoot_csat_responses")
          .select("rating, feedback_message, responded_at")
          .eq("contact_email", em)
          .order("responded_at", { ascending: false })
          .limit(10),
      ]);

      const convIds = (convRes.data || []).map((c: any) => c.chatwoot_conversation_id);

      const [auditRes, themeRes, stagesRes] = await Promise.all([
        convIds.length
          // paged-ok: filtrado por até 25 conversation_ids do contato.
          ? supabase
              .from("chatwoot_conversation_audits")
              .select("conversation_id, summary, churn_risk_score, severity")
              .in("conversation_id", convIds)
              .limit(50)

          : Promise.resolve({ data: [], error: null } as any),
        convIds.length
          ? supabase
              .from("chatwoot_conversation_themes")
              .select("conversation_id, primary_theme_canonical, main_pain, sentiment, urgency, summary, keywords")
              .in("conversation_id", convIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("ac_funnel_stages").select("ac_stage_id, title"),
      ]);

      const audits = new Map<number, any>();
      for (const a of (auditRes as any).data || []) audits.set(Number(a.conversation_id), a);
      const themes = new Map<number, any>();
      for (const t of (themeRes as any).data || []) themes.set(Number(t.conversation_id), t);
      const stageTitle = new Map<string, string>();
      for (const s of (stagesRes as any).data || []) stageTitle.set(String(s.ac_stage_id), s.title);

      const conversations: Client360Conversation[] = ((convRes.data || []) as any[]).map((c) => ({
        ...c,
        audit: audits.get(Number(c.chatwoot_conversation_id)) || null,
        theme: themes.get(Number(c.chatwoot_conversation_id)) || null,
      }));

      const deals = ((dealsRes as any).data || []).map((d: any) => ({
        ...d,
        stage_title: stageTitle.get(String(d.ac_stage_id)) || null,
      }));

      return {
        conversations,
        logs: (((logsRes as any).data || []) as CsContactLog[]),
        deals,
        csat: ((csatRes as any).data || []) as { rating: number; feedback_message: string | null; responded_at: string }[],
      };
    },
  });
}
