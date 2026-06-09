-- ENUMS
DO $$ BEGIN CREATE TYPE public.commission_payment_type AS ENUM ('mensal','anual_avista','anual_mensalizado','setup'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.commission_conversion_status AS ENUM ('calculated','pending_mapping','manual_override','ignored'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.commission_import_status AS ENUM ('draft','committed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- commission_reference
CREATE TABLE IF NOT EXISTS public.commission_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  payment_type public.commission_payment_type NOT NULL,
  plan_price numeric,
  plan_mrr numeric,
  commission_pct numeric NOT NULL DEFAULT 0,
  av_pct numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_name, payment_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_reference TO authenticated;
GRANT ALL ON public.commission_reference TO service_role;
ALTER TABLE public.commission_reference ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read commission_reference" ON public.commission_reference FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write commission_reference" ON public.commission_reference FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_commission_reference_updated BEFORE UPDATE ON public.commission_reference FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- commission_price_map
CREATE TABLE IF NOT EXISTS public.commission_price_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_id text,
  offer_name text,
  price_name text,
  plan_name text,
  payment_type public.commission_payment_type,
  area text,
  seller_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_label text,
  mrr_override numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price_id IS NOT NULL OR offer_name IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS commission_price_map_price_id_uq ON public.commission_price_map (price_id) WHERE price_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_price_map_offer_name_uq ON public.commission_price_map (lower(offer_name)) WHERE price_id IS NULL AND offer_name IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_price_map TO authenticated;
GRANT ALL ON public.commission_price_map TO service_role;
ALTER TABLE public.commission_price_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read price_map" ON public.commission_price_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write price_map" ON public.commission_price_map FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_commission_price_map_updated BEFORE UPDATE ON public.commission_price_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- commission_imports
CREATE TABLE IF NOT EXISTS public.commission_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  payment_month date NOT NULL,
  source_file text,
  row_count int NOT NULL DEFAULT 0,
  matched_count int NOT NULL DEFAULT 0,
  pending_count int NOT NULL DEFAULT 0,
  total_commission numeric NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.commission_import_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_imports TO authenticated;
GRANT ALL ON public.commission_imports TO service_role;
ALTER TABLE public.commission_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read imports" ON public.commission_imports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write imports" ON public.commission_imports FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_commission_imports_updated BEFORE UPDATE ON public.commission_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- commission_conversions
CREATE TABLE IF NOT EXISTS public.commission_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.commission_imports(id) ON DELETE CASCADE,
  sale_month date NOT NULL,
  payment_month date NOT NULL,
  company_id text,
  customer_name text,
  customer_email text,
  price_id text,
  offer_name text,
  gateway text,
  mrr numeric NOT NULL DEFAULT 0,
  recurrence_days int,
  origem_cliente text,
  resolved_plan text,
  resolved_payment_type public.commission_payment_type,
  resolved_seller_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_seller_label text,
  commission_pct numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  status public.commission_conversion_status NOT NULL DEFAULT 'calculated',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_conversions_import_idx ON public.commission_conversions(import_id);
CREATE INDEX IF NOT EXISTS commission_conversions_seller_idx ON public.commission_conversions(resolved_seller_user_id);
CREATE INDEX IF NOT EXISTS commission_conversions_payment_idx ON public.commission_conversions(payment_month);
CREATE INDEX IF NOT EXISTS commission_conversions_sale_idx ON public.commission_conversions(sale_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_conversions TO authenticated;
GRANT ALL ON public.commission_conversions TO service_role;
ALTER TABLE public.commission_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read conversions" ON public.commission_conversions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "seller read own conversions" ON public.commission_conversions FOR SELECT TO authenticated USING (resolved_seller_user_id = auth.uid());
CREATE POLICY "admin write conversions" ON public.commission_conversions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_commission_conversions_updated BEFORE UPDATE ON public.commission_conversions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();