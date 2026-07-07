
ALTER TABLE public.stripe_conversions
  ADD COLUMN IF NOT EXISTS is_reactivation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_churn_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS stripe_conversions_reactivation_idx
  ON public.stripe_conversions (is_reactivation)
  WHERE is_reactivation = true;

ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS reactivation_gap_months int NOT NULL DEFAULT 2;
