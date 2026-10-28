CREATE OR REPLACE FUNCTION public.classify_stripe_conversion(p_customer_id text, p_email text, p_price_id text, p_mrr numeric, p_self_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(conversion_type text, previous_mrr numeric, previous_price_id text, previous_conversion_id uuid)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prev record;
  v_email text := lower(trim(coalesce(p_email,'')));
BEGIN
  -- Only previously PAID subscriptions count as the customer's prior MRR;
  -- failed/pending attempts never existed for growth purposes.
  SELECT id, mrr, stripe_price_id INTO v_prev
  FROM public.stripe_conversions
  WHERE (p_self_id IS NULL OR id <> p_self_id)
    AND payment_status = 'paid'
    AND ((p_customer_id IS NOT NULL AND stripe_customer_id = p_customer_id)
      OR (v_email <> '' AND lower(customer_email) = v_email))
  ORDER BY COALESCE(converted_at, registered_at, created_at) DESC
  LIMIT 1;

  IF v_prev.id IS NULL THEN
    conversion_type := 'new'; previous_mrr := 0; previous_price_id := NULL; previous_conversion_id := NULL;
  ELSE
    previous_mrr := COALESCE(v_prev.mrr,0); previous_price_id := v_prev.stripe_price_id; previous_conversion_id := v_prev.id;
    conversion_type := CASE WHEN p_mrr > previous_mrr THEN 'upsell' WHEN p_mrr < previous_mrr THEN 'downgrade' ELSE 'renewal' END;
  END IF;
  RETURN NEXT;
END;
$function$;