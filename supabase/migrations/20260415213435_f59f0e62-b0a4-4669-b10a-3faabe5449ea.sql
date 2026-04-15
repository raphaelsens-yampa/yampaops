
-- Remove old columns from commission_products
ALTER TABLE public.commission_products
  DROP COLUMN IF EXISTS subscription_commission,
  DROP COLUMN IF EXISTS setup_commission,
  DROP COLUMN IF EXISTS annual_multiplier,
  DROP COLUMN IF EXISTS monthly_multiplier;

-- Add new columns to commission_products
ALTER TABLE public.commission_products
  ADD COLUMN plan_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN plan_mrr numeric NOT NULL DEFAULT 0,
  ADD COLUMN commission_percent numeric NOT NULL DEFAULT 10;

-- Stripe Price IDs table
CREATE TABLE public.stripe_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  plan_name text NOT NULL,
  price_id text NOT NULL,
  area text,
  seller_id uuid,
  mrr numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage stripe_prices" ON public.stripe_prices FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated view stripe_prices" ON public.stripe_prices FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_stripe_prices_updated_at BEFORE UPDATE ON public.stripe_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Commission triggers (bonus percentages on goal achievement)
CREATE TABLE public.commission_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  extra_percent numeric NOT NULL DEFAULT 20,
  goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  goal_type text NOT NULL DEFAULT 'company',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage commission_triggers" ON public.commission_triggers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated view commission_triggers" ON public.commission_triggers FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_commission_triggers_updated_at BEFORE UPDATE ON public.commission_triggers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update seed data for commission_products
UPDATE public.commission_products SET plan_value = 299, plan_mrr = 299, commission_percent = 10 WHERE name = '+Sucesso';
UPDATE public.commission_products SET plan_value = 199, plan_mrr = 199, commission_percent = 10 WHERE name = '+Lucro';
UPDATE public.commission_products SET plan_value = 99, plan_mrr = 99, commission_percent = 10 WHERE name = '+Controle';
UPDATE public.commission_products SET plan_value = 150, plan_mrr = 150, commission_percent = 10 WHERE name = 'BPO Junior';
UPDATE public.commission_products SET plan_value = 250, plan_mrr = 250, commission_percent = 10 WHERE name = 'BPO Pleno';
UPDATE public.commission_products SET plan_value = 400, plan_mrr = 400, commission_percent = 10 WHERE name = 'BPO Senior';
