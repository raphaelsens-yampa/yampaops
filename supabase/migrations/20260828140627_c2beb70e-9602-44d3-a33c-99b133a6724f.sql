REVOKE ALL ON FUNCTION public.commission_month_locked(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_month_locked(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_commission_clawbacks(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_clawbacks(date, date, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_commission_from_stripe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_commission_from_stripe(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_commissions_from_stripe_range(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_commissions_from_stripe_range(timestamp with time zone, timestamp with time zone) TO authenticated, service_role;