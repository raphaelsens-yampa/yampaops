ALTER TABLE public.stripe_conversions ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.stripe_conversions ADD COLUMN IF NOT EXISTS payment_checked_at timestamptz;
UPDATE public.stripe_conversions SET payment_status = 'paid'
 WHERE (stripe_invoice_id IS NOT NULL AND net_amount_source = 'invoice')
    OR attribution_source = 'metabase_4blue'
    OR converted_at < now() - interval '90 days';
CREATE INDEX IF NOT EXISTS idx_stripe_conversions_payment_status ON public.stripe_conversions(payment_status);