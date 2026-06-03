-- Add functional index to speed phone normalization joins
CREATE INDEX IF NOT EXISTS idx_cwconv_phone_digits_norm
  ON public.chatwoot_conversations (public.normalize_phone_digits(contact_phone));

CREATE INDEX IF NOT EXISTS idx_cwconv_email_lower
  ON public.chatwoot_conversations (lower(contact_email));

-- Set-based refresh: compute once per email/phone and update in a single statement
CREATE OR REPLACE FUNCTION public.scc_refresh_first_contact(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'tatico'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Build a unified (key_type, key, ts) stream then aggregate per key
  WITH conv AS (
    SELECT
      lower(c.contact_email) AS email_key,
      public.normalize_phone_digits(c.contact_phone) AS phone_key,
      c.chatwoot_contact_id,
      COALESCE(c.first_contact_message_at, c.opened_at) AS ts
    FROM public.chatwoot_conversations c
    WHERE COALESCE(c.first_contact_message_at, c.opened_at) IS NOT NULL
  ),
  bridge AS (
    SELECT chatwoot_contact_id, email, phone_digits, additional_emails, additional_phones
    FROM public.chatwoot_contacts
  ),
  -- direct email matches
  email_direct AS (
    SELECT email_key AS email_norm, MIN(ts) AS ts
    FROM conv
    WHERE email_key IS NOT NULL
    GROUP BY email_key
  ),
  -- bridged via chatwoot_contacts (primary + additional emails)
  email_bridged AS (
    SELECT lower(b.email) AS email_norm, MIN(c.ts) AS ts
    FROM conv c
    JOIN bridge b ON b.chatwoot_contact_id = c.chatwoot_contact_id
    WHERE b.email IS NOT NULL
    GROUP BY lower(b.email)
    UNION ALL
    SELECT ae AS email_norm, MIN(c.ts) AS ts
    FROM conv c
    JOIN bridge b ON b.chatwoot_contact_id = c.chatwoot_contact_id
    CROSS JOIN LATERAL unnest(COALESCE(b.additional_emails, ARRAY[]::text[])) ae
    GROUP BY ae
  ),
  email_min AS (
    SELECT email_norm, MIN(ts) AS ts
    FROM (SELECT * FROM email_direct UNION ALL SELECT * FROM email_bridged) u
    WHERE email_norm IS NOT NULL
    GROUP BY email_norm
  ),
  phone_direct AS (
    SELECT phone_key AS phone_digits, MIN(ts) AS ts
    FROM conv
    WHERE phone_key IS NOT NULL
    GROUP BY phone_key
  ),
  phone_bridged AS (
    SELECT b.phone_digits, MIN(c.ts) AS ts
    FROM conv c
    JOIN bridge b ON b.chatwoot_contact_id = c.chatwoot_contact_id
    WHERE b.phone_digits IS NOT NULL
    GROUP BY b.phone_digits
    UNION ALL
    SELECT ap AS phone_digits, MIN(c.ts) AS ts
    FROM conv c
    JOIN bridge b ON b.chatwoot_contact_id = c.chatwoot_contact_id
    CROSS JOIN LATERAL unnest(COALESCE(b.additional_phones, ARRAY[]::text[])) ap
    GROUP BY ap
  ),
  phone_min AS (
    SELECT phone_digits, MIN(ts) AS ts
    FROM (SELECT * FROM phone_direct UNION ALL SELECT * FROM phone_bridged) u
    WHERE phone_digits IS NOT NULL
    GROUP BY phone_digits
  ),
  scc AS (
    SELECT s.id, s.email_norm, s.phone_digits
    FROM public.sales_campaign_contacts s
    WHERE s.campaign_id = p_campaign_id
  ),
  computed AS (
    SELECT s.id,
           LEAST(
             COALESCE(em.ts, 'infinity'::timestamptz),
             COALESCE(pm.ts, 'infinity'::timestamptz)
           ) AS ts
    FROM scc s
    LEFT JOIN email_min em ON em.email_norm = s.email_norm
    LEFT JOIN phone_min pm ON pm.phone_digits = s.phone_digits
  ),
  upd AS (
    UPDATE public.sales_campaign_contacts s
    SET cw_first_contact_at = CASE WHEN c.ts = 'infinity'::timestamptz THEN NULL ELSE c.ts END
    FROM computed c
    WHERE s.id = c.id
      AND s.cw_first_contact_at IS DISTINCT FROM
          (CASE WHEN c.ts = 'infinity'::timestamptz THEN NULL ELSE c.ts END)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$function$;