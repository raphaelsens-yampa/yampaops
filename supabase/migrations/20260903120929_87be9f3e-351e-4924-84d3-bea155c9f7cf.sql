CREATE TABLE public.chatwoot_voice_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'manual',
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'running',
  total_conversations integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  paused_reason text,
  message text,
  cancel_requested boolean NOT NULL DEFAULT false,
  lock_expires_at timestamptz,
  triggered_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatwoot_voice_runs TO authenticated;
GRANT ALL ON public.chatwoot_voice_runs TO service_role;
ALTER TABLE public.chatwoot_voice_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice runs admin/tatico read" ON public.chatwoot_voice_runs FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "voice runs admin/tatico write" ON public.chatwoot_voice_runs FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE INDEX idx_voice_runs_started ON public.chatwoot_voice_runs (started_at DESC);

CREATE TABLE public.chatwoot_conversation_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id bigint NOT NULL UNIQUE,
  run_id uuid REFERENCES public.chatwoot_voice_runs(id) ON DELETE SET NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  model_used text,
  content_hash text,
  client_message_count integer NOT NULL DEFAULT 0,
  day_sp date,
  inbox_name text,
  assignee_name text,
  assignee_email text,
  themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_theme text,
  primary_theme_canonical text,
  main_pain text,
  sentiment text,
  urgency text,
  summary text,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatwoot_conversation_themes TO authenticated;
GRANT ALL ON public.chatwoot_conversation_themes TO service_role;
ALTER TABLE public.chatwoot_conversation_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice themes admin/tatico read" ON public.chatwoot_conversation_themes FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "voice themes admin/tatico write" ON public.chatwoot_conversation_themes FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE INDEX idx_voice_themes_day ON public.chatwoot_conversation_themes (day_sp DESC);
CREATE INDEX idx_voice_themes_canonical ON public.chatwoot_conversation_themes (primary_theme_canonical);

CREATE TABLE public.chatwoot_theme_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  description text,
  synonyms text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_theme_catalog_name ON public.chatwoot_theme_catalog (lower(canonical_name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatwoot_theme_catalog TO authenticated;
GRANT ALL ON public.chatwoot_theme_catalog TO service_role;
ALTER TABLE public.chatwoot_theme_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "theme catalog admin/tatico read" ON public.chatwoot_theme_catalog FOR SELECT TO authenticated USING (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "theme catalog admin/tatico write" ON public.chatwoot_theme_catalog FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_voice_runs_updated BEFORE UPDATE ON public.chatwoot_voice_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_voice_themes_updated BEFORE UPDATE ON public.chatwoot_conversation_themes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_theme_catalog_updated BEFORE UPDATE ON public.chatwoot_theme_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.chatwoot_client_word_counts(p_from date, p_to date, p_limit integer DEFAULT 150, p_inbox text DEFAULT NULL)
RETURNS TABLE(term text, occurrences bigint, conversations bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH msgs AS (
    SELECT m.chatwoot_conversation_id AS conv,
           lower(regexp_replace(coalesce(m.content_preview, ''), '(https?://\S+)|([0-9]{2,})|([^\wÀ-ÿ\s])', ' ', 'g')) AS txt
      FROM public.chatwoot_messages m
     WHERE m.sender_type = 'client'
       AND coalesce(m.is_private, false) = false
       AND (m.message_created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
       AND (p_inbox IS NULL OR m.inbox_name = p_inbox)
  ), words AS (
    SELECT conv, w AS term
      FROM msgs, unnest(string_to_array(regexp_replace(txt, '\s+', ' ', 'g'), ' ')) AS w
     WHERE length(w) >= 4
       AND w NOT IN (
        'para','pela','pelo','como','isso','esse','essa','esta','este','estou','estao','está','estão','mais','mas','muito','minha','meu','meus','minhas','nao','não','também','tambem','sobre','porque','quando','onde','qual','quais','tudo','todo','toda','todos','todas','aqui','ainda','agora','entao','então','entre','fica','ficar','tenho','temos','tem','ter','sendo','seria','pode','poderia','posso','preciso','precisa','favor','obrigado','obrigada','bom','boa','dia','tarde','noite','oi','olá','ola','tudo','bem','vocês','voces','você','voce','vamos','fazer','feito','sim','nada','algum','alguma','alguem','alguém','deles','dela','dele','sua','seu','suas','seus','nossa','nosso','depois','antes','desde','outro','outra','vezes','vez','coisa','consigo','consegue','conseguir','queria','quero','gostaria','ver','saber','fala','falar','disse','sendo','pois','porem','porém','assim','apenas','somente','melhor','pior','certo','errado','favor'
       )
  )
  SELECT term, count(*)::bigint AS occurrences, count(DISTINCT conv)::bigint AS conversations
    FROM words
   GROUP BY term
   ORDER BY count(DISTINCT conv) DESC, count(*) DESC
   LIMIT greatest(coalesce(p_limit, 150), 1);
$$;
REVOKE ALL ON FUNCTION public.chatwoot_client_word_counts(date, date, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.chatwoot_client_word_counts(date, date, integer, text) TO authenticated;