
ALTER TABLE public.sales_campaigns
  ADD COLUMN IF NOT EXISTS funnel_stages jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.scc_list_campaign_tags(p_campaign_id uuid)
RETURNS TABLE(tag text, usage_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH scc AS (
    SELECT email_norm, phone_digits
    FROM public.sales_campaign_contacts
    WHERE campaign_id = p_campaign_id
  ),
  conv AS (
    SELECT DISTINCT c.chatwoot_conversation_id, c.labels
    FROM public.chatwoot_conversations c
    LEFT JOIN public.chatwoot_contacts cc ON cc.chatwoot_contact_id = c.chatwoot_contact_id
    JOIN scc s ON
      (s.email_norm IS NOT NULL AND (
        lower(c.contact_email) = s.email_norm
        OR cc.email = s.email_norm
        OR s.email_norm = ANY(cc.additional_emails)
      ))
      OR
      (s.phone_digits IS NOT NULL AND (
        public.normalize_phone_digits(c.contact_phone) = s.phone_digits
        OR cc.phone_digits = s.phone_digits
        OR s.phone_digits = ANY(cc.additional_phones)
      ))
  )
  SELECT l AS tag, count(*)::int AS usage_count
  FROM conv, unnest(conv.labels) AS l
  WHERE l IS NOT NULL AND l <> ''
  GROUP BY l
  ORDER BY count(*) DESC, l ASC;
$$;

CREATE OR REPLACE FUNCTION public.scc_compute_tag_funnel(p_campaign_id uuid)
RETURNS TABLE(stage_id text, contact_count integer, mrr_total numeric, contact_ids uuid[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stages jsonb;
BEGIN
  SELECT funnel_stages INTO v_stages FROM public.sales_campaigns WHERE id = p_campaign_id;
  IF v_stages IS NULL OR jsonb_array_length(v_stages) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH stages AS (
    SELECT
      (s->>'id') AS sid,
      COALESCE(s->>'match','any') AS match_mode,
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(s->'tags') x), '{}'::text[]) AS tags,
      COALESCE((s->>'position')::int, ord::int) AS pos
    FROM jsonb_array_elements(v_stages) WITH ORDINALITY AS t(s, ord)
  ),
  scc AS (
    SELECT id, email_norm, phone_digits, COALESCE(mrr_generated, 0) AS mrr
    FROM public.sales_campaign_contacts
    WHERE campaign_id = p_campaign_id
  ),
  -- aggregate all labels per contact across all related conversations
  contact_labels AS (
    SELECT s.id AS contact_id, s.mrr,
           COALESCE(
             (SELECT array_agg(DISTINCT l) FROM (
                SELECT unnest(c.labels) AS l
                FROM public.chatwoot_conversations c
                LEFT JOIN public.chatwoot_contacts cc ON cc.chatwoot_contact_id = c.chatwoot_contact_id
                WHERE
                  (s.email_norm IS NOT NULL AND (
                    lower(c.contact_email) = s.email_norm
                    OR cc.email = s.email_norm
                    OR s.email_norm = ANY(cc.additional_emails)
                  ))
                  OR
                  (s.phone_digits IS NOT NULL AND (
                    public.normalize_phone_digits(c.contact_phone) = s.phone_digits
                    OR cc.phone_digits = s.phone_digits
                    OR s.phone_digits = ANY(cc.additional_phones)
                  ))
              ) sub
              WHERE l IS NOT NULL AND l <> ''
             ),
             '{}'::text[]
           ) AS labels
    FROM scc s
  ),
  matched AS (
    SELECT cl.contact_id, cl.mrr, st.sid, st.pos
    FROM contact_labels cl
    CROSS JOIN stages st
    WHERE array_length(st.tags, 1) IS NOT NULL
      AND CASE
        WHEN st.match_mode = 'all' THEN st.tags <@ cl.labels
        ELSE cl.labels && st.tags
      END
  ),
  best AS (
    SELECT DISTINCT ON (contact_id) contact_id, mrr, sid, pos
    FROM matched
    ORDER BY contact_id, pos DESC
  )
  SELECT st.sid::text,
         COALESCE(COUNT(b.contact_id), 0)::int,
         COALESCE(SUM(b.mrr), 0)::numeric,
         COALESCE(array_agg(b.contact_id) FILTER (WHERE b.contact_id IS NOT NULL), '{}'::uuid[])
  FROM stages st
  LEFT JOIN best b ON b.sid = st.sid
  GROUP BY st.sid, st.pos
  ORDER BY st.pos ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scc_list_campaign_tags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scc_compute_tag_funnel(uuid) TO authenticated;
