REVOKE EXECUTE ON FUNCTION public.campaign_cohort_refresh(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.campaign_cohort_curve(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.campaign_cohort_refresh(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_cohort_curve(uuid) TO authenticated;