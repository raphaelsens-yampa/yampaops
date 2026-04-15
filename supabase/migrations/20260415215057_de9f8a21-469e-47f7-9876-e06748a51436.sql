
ALTER TABLE public.stripe_prices
  ADD COLUMN commission_percent numeric NOT NULL DEFAULT 0;
