
CREATE OR REPLACE FUNCTION public.resolve_stripe_seller(p_customer_id text, p_email text, p_at timestamp with time zone DEFAULT now(), p_price_id text DEFAULT NULL)
 RETURNS TABLE(seller_id uuid, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(p_email,'')));
  v_seller uuid;
BEGIN
  -- 1) Price Map (fonte de verdade — define área/vendedor comissionado)
  IF p_price_id IS NOT NULL AND p_price_id <> '' THEN
    SELECT seller_user_id INTO v_seller
    FROM public.commission_price_map
    WHERE price_id = p_price_id AND seller_user_id IS NOT NULL
    LIMIT 1;
    IF v_seller IS NOT NULL THEN
      seller_id := v_seller; source := 'price_map'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- 2) previous conversion seller
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

  -- 3) chatwoot conversation assignee email -> profile
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

  -- 4) sales_campaign_contacts assigned_seller_id
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
    NULL;
  END;

  seller_id := NULL; source := NULL; RETURN NEXT;
END;
$function$;
