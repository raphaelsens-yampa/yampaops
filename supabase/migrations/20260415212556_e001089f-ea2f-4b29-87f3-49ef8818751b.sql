
-- Enums
CREATE TYPE public.commission_type AS ENUM ('earned', 'clawback');
CREATE TYPE public.commission_status AS ENUM ('provisioned', 'paid', 'reversed');

-- Commission Products
CREATE TABLE public.commission_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_commission numeric NOT NULL DEFAULT 0,
  setup_commission numeric NOT NULL DEFAULT 0,
  annual_multiplier numeric NOT NULL DEFAULT 1.0,
  monthly_multiplier numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage commission_products" ON public.commission_products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated view commission_products" ON public.commission_products FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_commission_products_updated_at BEFORE UPDATE ON public.commission_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Commission Settings (single row)
CREATE TABLE public.commission_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarantee_months integer NOT NULL DEFAULT 3,
  payment_day integer NOT NULL DEFAULT 10,
  t_plus_months integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage commission_settings" ON public.commission_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated view commission_settings" ON public.commission_settings FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_commission_settings_updated_at BEFORE UPDATE ON public.commission_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Commissions
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE NOT NULL,
  seller_id uuid NOT NULL,
  product_id uuid REFERENCES public.commission_products(id) ON DELETE SET NULL,
  sale_date date NOT NULL,
  payment_month date NOT NULL,
  commission_amount numeric NOT NULL DEFAULT 0,
  type commission_type NOT NULL DEFAULT 'earned',
  status commission_status NOT NULL DEFAULT 'provisioned',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage commissions" ON public.commissions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Sellers view own commissions" ON public.commissions FOR SELECT TO authenticated USING (auth.uid() = seller_id);

-- Alter opportunities
ALTER TABLE public.opportunities
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN cancellation_date date,
  ADD COLUMN product_id uuid REFERENCES public.commission_products(id) ON DELETE SET NULL,
  ADD COLUMN billing_type text NOT NULL DEFAULT 'monthly';

-- Seed commission_products
INSERT INTO public.commission_products (name, subscription_commission, setup_commission, annual_multiplier, monthly_multiplier) VALUES
  ('+Sucesso', 125.09, 35.00, 1.0, 1.0),
  ('+Lucro', 100.00, 25.00, 1.0, 1.0),
  ('+Controle', 75.00, 15.00, 1.0, 1.0),
  ('BPO Junior', 50.00, 10.00, 1.0, 1.0),
  ('BPO Pleno', 75.00, 15.00, 1.0, 1.0),
  ('BPO Senior', 100.00, 20.00, 1.0, 1.0);

-- Seed commission_settings
INSERT INTO public.commission_settings (guarantee_months, payment_day, t_plus_months) VALUES (3, 10, 2);
