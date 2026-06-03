UPDATE public.sales_campaign_contacts s
SET cw_first_contact_at = public.scc_compute_first_contact_for(s.email_norm, s.phone_digits)
WHERE s.campaign_id = '4c6cc65d-f62b-41bd-b49b-934e3baed3e3'
  AND (s.email_norm IS NOT NULL OR s.phone_digits IS NOT NULL);