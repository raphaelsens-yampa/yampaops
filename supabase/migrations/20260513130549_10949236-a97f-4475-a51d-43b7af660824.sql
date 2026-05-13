ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS phone text;
CREATE INDEX IF NOT EXISTS idx_opportunities_phone ON public.opportunities(phone) WHERE phone IS NOT NULL;