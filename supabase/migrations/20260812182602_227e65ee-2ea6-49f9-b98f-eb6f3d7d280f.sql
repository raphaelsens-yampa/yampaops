CREATE UNIQUE INDEX IF NOT EXISTS tactical_stripe_daily_backup_uniq
  ON public.tactical_stripe_daily_backup (data, metric_key, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX IF NOT EXISTS tactical_realized_overrides_uniq
  ON public.tactical_realized_overrides (data, metric_key, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));