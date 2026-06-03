-- 1) Add cw_first_contact_at to sales_campaign_contacts
ALTER TABLE public.sales_campaign_contacts
  ADD COLUMN IF NOT EXISTS cw_first_contact_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scc_cw_first_contact_at
  ON public.sales_campaign_contacts(campaign_id, cw_first_contact_at);

-- 2) Initial backfill from chatwoot_conversations using matched_chatwoot_contact_id
UPDATE public.sales_campaign_contacts scc
SET cw_first_contact_at = sub.first_at
FROM (
  SELECT chatwoot_contact_id,
         MIN(COALESCE(first_contact_message_at, opened_at)) AS first_at
  FROM public.chatwoot_conversations
  WHERE chatwoot_contact_id IS NOT NULL
    AND COALESCE(first_contact_message_at, opened_at) IS NOT NULL
  GROUP BY chatwoot_contact_id
) sub
WHERE scc.matched_chatwoot_contact_id = sub.chatwoot_contact_id;

-- 3) Trigger function: keep cw_first_contact_at in sync on every chatwoot conversation change
CREATE OR REPLACE FUNCTION public.scc_sync_first_contact_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid bigint;
  v_first timestamptz;
BEGIN
  v_cid := COALESCE(NEW.chatwoot_contact_id, OLD.chatwoot_contact_id);
  IF v_cid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT MIN(COALESCE(first_contact_message_at, opened_at))
  INTO v_first
  FROM public.chatwoot_conversations
  WHERE chatwoot_contact_id = v_cid;

  UPDATE public.sales_campaign_contacts
  SET cw_first_contact_at = v_first
  WHERE matched_chatwoot_contact_id = v_cid
    AND cw_first_contact_at IS DISTINCT FROM v_first;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_scc_sync_first_contact_at ON public.chatwoot_conversations;
CREATE TRIGGER trg_scc_sync_first_contact_at
AFTER INSERT OR UPDATE OF first_contact_message_at, opened_at, chatwoot_contact_id
  OR DELETE
ON public.chatwoot_conversations
FOR EACH ROW
EXECUTE FUNCTION public.scc_sync_first_contact_at();

-- 4) Also sync when a campaign contact gets newly matched to a chatwoot contact
CREATE OR REPLACE FUNCTION public.scc_set_first_contact_on_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.matched_chatwoot_contact_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.matched_chatwoot_contact_id IS DISTINCT FROM OLD.matched_chatwoot_contact_id) THEN
    SELECT MIN(COALESCE(first_contact_message_at, opened_at))
    INTO NEW.cw_first_contact_at
    FROM public.chatwoot_conversations
    WHERE chatwoot_contact_id = NEW.matched_chatwoot_contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scc_set_first_contact_on_match ON public.sales_campaign_contacts;
CREATE TRIGGER trg_scc_set_first_contact_on_match
BEFORE INSERT OR UPDATE OF matched_chatwoot_contact_id
ON public.sales_campaign_contacts
FOR EACH ROW
EXECUTE FUNCTION public.scc_set_first_contact_on_match();