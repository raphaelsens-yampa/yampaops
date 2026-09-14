ALTER FUNCTION public.tactical_weekly_mrr_actual(date, date, date) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) TO service_role;