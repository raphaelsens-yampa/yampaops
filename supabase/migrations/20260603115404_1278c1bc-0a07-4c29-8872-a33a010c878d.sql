DROP FUNCTION IF EXISTS public.scc_compute_first_contact_for(text, text) CASCADE;

CREATE FUNCTION public.scc_compute_first_contact_for(p_email text, p_phone text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MIN(COALESCE(c.first_contact_message_at, c.opened_at))
  FROM public.chatwoot_conversations c
  LEFT JOIN public.chatwoot_contacts cc ON cc.chatwoot_contact_id = c.chatwoot_contact_id
  WHERE COALESCE(c.first_contact_message_at, c.opened_at) IS NOT NULL
    AND (
      (p_email IS NOT NULL AND (
        lower(c.contact_email) = p_email
        OR cc.email = p_email
        OR p_email = ANY(cc.additional_emails)
      ))
      OR
      (p_phone IS NOT NULL AND (
        public.normalize_phone_digits(c.contact_phone) = p_phone
        OR cc.phone_digits = p_phone
        OR p_phone = ANY(cc.additional_phones)
      ))
    );
$$;

CREATE OR REPLACE FUNCTION public.scc_sync_first_contact_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  v_email := lower(COALESCE(NEW.contact_email, OLD.contact_email));
  v_phone := public.normalize_phone_digits(COALESCE(NEW.contact_phone, OLD.contact_phone));
  UPDATE public.sales_campaign_contacts s
  SET cw_first_contact_at = public.scc_compute_first_contact_for(s.email_norm, s.phone_digits)
  WHERE (v_email IS NOT NULL AND s.email_norm = v_email)
     OR (v_phone IS NOT NULL AND s.phone_digits = v_phone);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_scc_sync_first_contact_at ON public.chatwoot_conversations;
CREATE TRIGGER trg_scc_sync_first_contact_at
AFTER INSERT OR UPDATE OF first_contact_message_at, opened_at, contact_email, contact_phone
ON public.chatwoot_conversations
FOR EACH ROW
EXECUTE FUNCTION public.scc_sync_first_contact_at();

CREATE OR REPLACE FUNCTION public.scc_set_first_contact_on_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.email_norm IS DISTINCT FROM OLD.email_norm
     OR NEW.phone_digits IS DISTINCT FROM OLD.phone_digits THEN
    NEW.cw_first_contact_at := public.scc_compute_first_contact_for(NEW.email_norm, NEW.phone_digits);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scc_set_first_contact_on_match ON public.sales_campaign_contacts;
CREATE TRIGGER trg_scc_set_first_contact_on_match
BEFORE INSERT OR UPDATE OF email_norm, phone_digits
ON public.sales_campaign_contacts
FOR EACH ROW
EXECUTE FUNCTION public.scc_set_first_contact_on_match();