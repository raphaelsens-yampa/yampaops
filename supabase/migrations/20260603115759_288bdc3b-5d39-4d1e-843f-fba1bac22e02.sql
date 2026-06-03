CREATE OR REPLACE FUNCTION public.scc_refresh_first_contact(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'tatico'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.sales_campaign_contacts s
  SET cw_first_contact_at = public.scc_compute_first_contact_for(s.email_norm, s.phone_digits)
  WHERE s.campaign_id = p_campaign_id
    AND (s.email_norm IS NOT NULL OR s.phone_digits IS NOT NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.scc_refresh_first_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scc_refresh_first_contact(uuid) TO authenticated;