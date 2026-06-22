
-- 1) Add columns to stripe_conversions
ALTER TABLE public.stripe_conversions
  ADD COLUMN IF NOT EXISTS conversion_type text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS previous_mrr numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_price_id text,
  ADD COLUMN IF NOT EXISTS previous_conversion_id uuid REFERENCES public.stripe_conversions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_source text;

ALTER TABLE public.stripe_conversions
  DROP CONSTRAINT IF EXISTS stripe_conversions_type_check;
ALTER TABLE public.stripe_conversions
  ADD CONSTRAINT stripe_conversions_type_check
  CHECK (conversion_type IN ('new','upsell','downgrade','renewal'));

-- delta_mrr as generated column (drop+add to be safe across reruns)
ALTER TABLE public.stripe_conversions DROP COLUMN IF EXISTS delta_mrr;
ALTER TABLE public.stripe_conversions
  ADD COLUMN delta_mrr numeric GENERATED ALWAYS AS (mrr - previous_mrr) STORED;

-- 2) Replace unique index to allow multiple rows per subscription
DROP INDEX IF EXISTS public.stripe_conversions_subscription_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS stripe_conversions_sub_price_event_uniq
  ON public.stripe_conversions (stripe_subscription_id, stripe_price_id, stripe_event_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stripe_conversions_customer_idx
  ON public.stripe_conversions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS stripe_conversions_type_idx
  ON public.stripe_conversions (conversion_type);
CREATE INDEX IF NOT EXISTS stripe_conversions_assigned_seller_idx
  ON public.stripe_conversions (assigned_seller_id);

-- 3) classify_stripe_conversion: compare new mrr/price to last conversion for same customer (or email)
CREATE OR REPLACE FUNCTION public.classify_stripe_conversion(
  p_customer_id text,
  p_email text,
  p_price_id text,
  p_mrr numeric,
  p_self_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conversion_type text,
  previous_mrr numeric,
  previous_price_id text,
  previous_conversion_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev record;
  v_email text := lower(trim(coalesce(p_email,'')));
BEGIN
  SELECT id, mrr, stripe_price_id
    INTO v_prev
  FROM public.stripe_conversions
  WHERE (p_self_id IS NULL OR id <> p_self_id)
    AND (
      (p_customer_id IS NOT NULL AND stripe_customer_id = p_customer_id)
      OR (v_email <> '' AND lower(customer_email) = v_email)
    )
  ORDER BY COALESCE(converted_at, registered_at, created_at) DESC
  LIMIT 1;

  IF v_prev.id IS NULL THEN
    conversion_type := 'new';
    previous_mrr := 0;
    previous_price_id := NULL;
    previous_conversion_id := NULL;
  ELSIF p_mrr > COALESCE(v_prev.mrr,0) THEN
    conversion_type := 'upsell';
    previous_mrr := COALESCE(v_prev.mrr,0);
    previous_price_id := v_prev.stripe_price_id;
    previous_conversion_id := v_prev.id;
  ELSIF p_mrr < COALESCE(v_prev.mrr,0) THEN
    conversion_type := 'downgrade';
    previous_mrr := COALESCE(v_prev.mrr,0);
    previous_price_id := v_prev.stripe_price_id;
    previous_conversion_id := v_prev.id;
  ELSE
    conversion_type := 'renewal';
    previous_mrr := COALESCE(v_prev.mrr,0);
    previous_price_id := v_prev.stripe_price_id;
    previous_conversion_id := v_prev.id;
  END IF;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_stripe_conversion(text,text,text,numeric,uuid) TO authenticated, service_role;

-- 4) resolve_stripe_seller: returns (seller_id, source)
CREATE OR REPLACE FUNCTION public.resolve_stripe_seller(
  p_customer_id text,
  p_email text,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  seller_id uuid,
  source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email,'')));
  v_seller uuid;
BEGIN
  -- 1) previous conversion seller
  SELECT assigned_seller_id INTO v_seller
  FROM public.stripe_conversions
  WHERE assigned_seller_id IS NOT NULL
    AND (
      (p_customer_id IS NOT NULL AND stripe_customer_id = p_customer_id)
      OR (v_email <> '' AND lower(customer_email) = v_email)
    )
  ORDER BY COALESCE(converted_at, registered_at, created_at) DESC
  LIMIT 1;
  IF v_seller IS NOT NULL THEN
    seller_id := v_seller; source := 'previous_conversion'; RETURN NEXT; RETURN;
  END IF;

  -- 2) chatwoot conversation assignee email -> profile
  IF v_email <> '' THEN
    SELECT p.user_id INTO v_seller
    FROM public.chatwoot_conversations c
    JOIN public.profiles p ON lower(p.email) = lower(c.assignee_email)
    WHERE c.assignee_email IS NOT NULL
      AND lower(c.contact_email) = v_email
      AND COALESCE(c.first_contact_message_at, c.opened_at) >= (p_at - interval '60 days')
    ORDER BY COALESCE(c.first_contact_message_at, c.opened_at) DESC
    LIMIT 1;
    IF v_seller IS NOT NULL THEN
      seller_id := v_seller; source := 'chatwoot'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- 3) sales_campaign_contacts assigned_seller_id (column may not exist on all envs — guard)
  BEGIN
    IF v_email <> '' THEN
      EXECUTE 'SELECT assigned_seller_id FROM public.sales_campaign_contacts
               WHERE assigned_seller_id IS NOT NULL AND email_norm = $1
               ORDER BY created_at DESC LIMIT 1'
        INTO v_seller USING v_email;
      IF v_seller IS NOT NULL THEN
        seller_id := v_seller; source := 'campaign'; RETURN NEXT; RETURN;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    -- ignore: column not present
    NULL;
  END;

  seller_id := NULL; source := NULL; RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_stripe_seller(text,text,timestamptz) TO authenticated, service_role;
