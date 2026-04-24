DROP INDEX IF EXISTS public.commission_products_stripe_price_id_key;
CREATE INDEX IF NOT EXISTS commission_products_stripe_price_id_idx ON public.commission_products(stripe_price_id) WHERE stripe_price_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_products_product_id_key ON public.commission_products(product_id) WHERE product_id IS NOT NULL;