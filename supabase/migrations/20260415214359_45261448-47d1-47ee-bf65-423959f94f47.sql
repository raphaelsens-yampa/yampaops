
-- Add columns to commission_products
ALTER TABLE public.commission_products
  ADD COLUMN product_id text,
  ADD COLUMN plan_name text NOT NULL DEFAULT '',
  ADD COLUMN periodicity text NOT NULL DEFAULT 'Mensal';

-- Rename product_id on stripe_prices to commission_product_id for clarity
ALTER TABLE public.stripe_prices
  RENAME COLUMN product_id TO commission_product_id;
