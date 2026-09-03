DROP INDEX IF EXISTS public.idx_theme_catalog_name;
ALTER TABLE public.chatwoot_theme_catalog ADD CONSTRAINT chatwoot_theme_catalog_name_key UNIQUE (canonical_name);

CREATE OR REPLACE FUNCTION public.chatwoot_client_word_counts(p_from date, p_to date, p_limit integer DEFAULT 150, p_inbox text DEFAULT NULL)
RETURNS TABLE(term text, occurrences bigint, conversations bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
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
        'para','pela','pelo','como','isso','esse','essa','esta','este','estou','estao','está','estão','mais','muito','minha','meus','minhas','nao','não','também','tambem','sobre','porque','quando','onde','qual','quais','tudo','todo','toda','todos','todas','aqui','ainda','agora','entao','então','entre','fica','ficar','tenho','temos','sendo','seria','pode','poderia','posso','preciso','precisa','favor','obrigado','obrigada','dia','tarde','noite','olá','vocês','voces','você','voce','vamos','fazer','feito','nada','algum','alguma','alguem','alguém','deles','dela','dele','suas','seus','nossa','nosso','depois','antes','desde','outro','outra','vezes','coisa','consigo','consegue','conseguir','queria','quero','gostaria','saber','fala','falar','disse','pois','porem','porém','assim','apenas','somente','melhor','pior','certo','errado'
       )
  )
  SELECT w.term, count(*)::bigint AS occurrences, count(DISTINCT w.conv)::bigint AS conversations
    FROM words w
   GROUP BY w.term
   ORDER BY count(DISTINCT w.conv) DESC, count(*) DESC
   LIMIT greatest(coalesce(p_limit, 150), 1);
END;
$$;
REVOKE ALL ON FUNCTION public.chatwoot_client_word_counts(date, date, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.chatwoot_client_word_counts(date, date, integer, text) TO authenticated;