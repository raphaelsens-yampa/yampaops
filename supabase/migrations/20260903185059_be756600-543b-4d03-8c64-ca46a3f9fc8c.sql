REVOKE ALL ON FUNCTION public.cs_sync_last_contact() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_snapshot_base() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_segment_preview(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_portfolio_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_segment_preview(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cs_portfolio_refresh() TO authenticated;