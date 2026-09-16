ALTER FUNCTION public.metabase_campaign_entries_monthly(integer, date) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.metabase_campaign_entries_monthly(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metabase_campaign_entries_monthly(integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.metabase_campaign_entries_monthly(integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metabase_campaign_entries_monthly(integer, date) TO service_role;