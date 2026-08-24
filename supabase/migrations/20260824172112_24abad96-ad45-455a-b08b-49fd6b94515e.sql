CREATE OR REPLACE FUNCTION public.campaign_cohort_stripe_fill(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidates int := 0;
  v_matched int := 0;
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT c.id AS contact_id, c.campaign_id, c.email_norm
  FROM public.campaign_cohort_contacts c
  LEFT JOIN public.campaign_cohort_results r
    ON r.contact_id = c.id AND r.campaign_id = c.campaign_id
  WHERE c.campaign_id = p_campaign_id
    AND (r.id IS NULL OR COALESCE(r.status,'never') IN ('never','unknown'));

  SELECT count(*) INTO v_candidates FROM _cand;

  DELETE FROM public.campaign_cohort_results r
  USING _cand k
  WHERE r.contact_id = k.contact_id AND r.campaign_id = k.campaign_id;

  WITH sc AS (
    SELECT DISTINCT ON (lower(s.customer_email))
      lower(s.customer_email) AS email_norm,
      COALESCE(s.mrr_net, s.mrr, 0) AS mrr,
      s.plan_name, s.product_name,
      COALESCE(s.converted_at, s.registered_at, s.created_at)::date AS started_at
    FROM public.stripe_conversions s
    WHERE s.customer_email IS NOT NULL AND s.customer_email <> ''
    ORDER BY lower(s.customer_email), COALESCE(s.converted_at, s.registered_at, s.created_at) DESC
  ),
  churn AS (
    SELECT DISTINCT ON (lower(e.customer_email))
      lower(e.customer_email) AS email_norm,
      e.canceled_at::date AS canceled_at,
      e.cancellation_reason
    FROM public.stripe_churn_events e
    WHERE e.customer_email IS NOT NULL AND e.customer_email <> ''
    ORDER BY lower(e.customer_email), e.canceled_at DESC
  ),
  ins AS (
    INSERT INTO public.campaign_cohort_results (
      campaign_id, contact_id, email_norm, status, mrr, plan_name, offer_name,
      origem_cliente, started_at, canceled_at, churn_type, source, snapshot_date, computed_at
    )
    SELECT
      k.campaign_id, k.contact_id, k.email_norm,
      CASE
        WHEN s.email_norm IS NULL THEN 'never'
        WHEN ch.canceled_at IS NOT NULL THEN 'canceled'
        ELSE 'active'
      END,
      CASE WHEN s.email_norm IS NOT NULL AND ch.canceled_at IS NULL THEN COALESCE(s.mrr,0) ELSE 0 END,
      s.plan_name, s.product_name,
      NULL, s.started_at, ch.canceled_at, ch.cancellation_reason,
      CASE WHEN s.email_norm IS NOT NULL THEN 'stripe' ELSE NULL END,
      NULL, now()
    FROM _cand k
    LEFT JOIN sc s ON s.email_norm = k.email_norm
    LEFT JOIN churn ch ON ch.email_norm = k.email_norm
    RETURNING source
  )
  SELECT count(*) FILTER (WHERE source = 'stripe') INTO v_matched FROM ins;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'candidates', v_candidates,
    'matched', v_matched,
    'computed_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.campaign_cohort_stripe_fill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_cohort_stripe_fill(uuid) TO authenticated;