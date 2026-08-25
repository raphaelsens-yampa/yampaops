CREATE TABLE public.tactical_campaign_coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id text NOT NULL UNIQUE,
  coupon_name text,
  is_campaign boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_campaign_coupons TO authenticated;
GRANT ALL ON public.tactical_campaign_coupons TO service_role;

ALTER TABLE public.tactical_campaign_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem cupons de campanha"
ON public.tactical_campaign_coupons FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tatico e admin gerenciam cupons de campanha"
ON public.tactical_campaign_coupons FOR ALL TO authenticated
USING (public.is_tatico_or_admin(auth.uid()))
WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER tactical_campaign_coupons_updated_at
BEFORE UPDATE ON public.tactical_campaign_coupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();