
ALTER TABLE public.stripe_prices
  ADD COLUMN product_id uuid REFERENCES public.commission_products(id) ON DELETE SET NULL,
  ADD COLUMN commission_value numeric NOT NULL DEFAULT 0;
