ALTER TABLE public.stripe_conversions ALTER COLUMN converted_at DROP NOT NULL;
ALTER TABLE public.stripe_conversions ALTER COLUMN converted_at DROP DEFAULT;
COMMENT ON COLUMN public.stripe_conversions.registered_at IS 'Data de criação do customer no Stripe (customer.created)';
COMMENT ON COLUMN public.stripe_conversions.converted_at IS 'Data do primeiro pagamento confirmado no Stripe (earliest paid invoice)';