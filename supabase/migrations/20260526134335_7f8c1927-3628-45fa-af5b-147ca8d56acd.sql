-- Enum para tipo de plano
CREATE TYPE public.discount_plan_type AS ENUM ('software', 'consultoria_bpo');

-- =====================================================
-- TABELA: discount_tiers
-- =====================================================
CREATE TABLE public.discount_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tpv_min numeric NOT NULL CHECK (tpv_min >= 0),
  tpv_max numeric CHECK (tpv_max IS NULL OR tpv_max > tpv_min),
  discount_value numeric NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.discount_tiers TO authenticated;
GRANT ALL ON public.discount_tiers TO service_role;

ALTER TABLE public.discount_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view discount_tiers"
  ON public.discount_tiers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage discount_tiers"
  ON public.discount_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_discount_tiers_updated_at
  BEFORE UPDATE ON public.discount_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial
INSERT INTO public.discount_tiers (name, tpv_min, tpv_max, discount_value, position) VALUES
  ('Test Drive', 20000, 49999.99, 40, 1),
  ('Parceiro', 50000, 89999.99, 100, 2),
  ('Yampa Total', 90000, NULL, 180, 3);

-- =====================================================
-- TABELA: discount_clients
-- =====================================================
CREATE TABLE public.discount_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid UNIQUE,
  company_name text NOT NULL,
  cnpj text,
  saas_plan_name text NOT NULL DEFAULT '',
  saas_base_price numeric NOT NULL DEFAULT 0 CHECK (saas_base_price >= 0),
  plan_type public.discount_plan_type NOT NULL DEFAULT 'software',
  embedded_software_value numeric NOT NULL DEFAULT 0 CHECK (embedded_software_value >= 0),
  cs_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_discount_clients_cs ON public.discount_clients(cs_user_id);
CREATE INDEX idx_discount_clients_opp ON public.discount_clients(opportunity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_clients TO authenticated;
GRANT ALL ON public.discount_clients TO service_role;

ALTER TABLE public.discount_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage discount_clients"
  ON public.discount_clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CS view own discount_clients"
  ON public.discount_clients FOR SELECT TO authenticated
  USING (cs_user_id = auth.uid());

CREATE POLICY "Tatico view discount_clients"
  ON public.discount_clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tatico'::app_role));

CREATE TRIGGER update_discount_clients_updated_at
  BEFORE UPDATE ON public.discount_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- TABELA: tpv_monthly
-- =====================================================
CREATE TABLE public.tpv_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.discount_clients(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  tpv_amount numeric NOT NULL DEFAULT 0 CHECK (tpv_amount >= 0),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('pending','synced','error')),
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, reference_month)
);

CREATE INDEX idx_tpv_monthly_month ON public.tpv_monthly(reference_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tpv_monthly TO authenticated;
GRANT ALL ON public.tpv_monthly TO service_role;

ALTER TABLE public.tpv_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tpv_monthly"
  ON public.tpv_monthly FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CS view own tpv_monthly"
  ON public.tpv_monthly FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.discount_clients dc
    WHERE dc.id = tpv_monthly.client_id AND dc.cs_user_id = auth.uid()
  ));

CREATE POLICY "Tatico view tpv_monthly"
  ON public.tpv_monthly FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tatico'::app_role));

CREATE TRIGGER update_tpv_monthly_updated_at
  BEFORE UPDATE ON public.tpv_monthly
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- TABELA: invoice_log
-- =====================================================
CREATE TABLE public.invoice_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.discount_clients(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  tier_id uuid REFERENCES public.discount_tiers(id) ON DELETE SET NULL,
  tpv_amount numeric NOT NULL DEFAULT 0,
  original_value numeric NOT NULL DEFAULT 0,
  discount_applied numeric NOT NULL DEFAULT 0,
  final_value numeric NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now(),
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, reference_month)
);

CREATE INDEX idx_invoice_log_month ON public.invoice_log(reference_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_log TO authenticated;
GRANT ALL ON public.invoice_log TO service_role;

ALTER TABLE public.invoice_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invoice_log"
  ON public.invoice_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CS view own invoice_log"
  ON public.invoice_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.discount_clients dc
    WHERE dc.id = invoice_log.client_id AND dc.cs_user_id = auth.uid()
  ));

CREATE POLICY "Tatico view invoice_log"
  ON public.invoice_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tatico'::app_role));

CREATE TRIGGER update_invoice_log_updated_at
  BEFORE UPDATE ON public.invoice_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNÇÃO: calculate_discount
-- =====================================================
CREATE OR REPLACE FUNCTION public.calculate_discount(
  p_plan_type public.discount_plan_type,
  p_base_price numeric,
  p_embedded_value numeric,
  p_tpv numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tier record;
  v_applicable_base numeric;
  v_discount numeric := 0;
  v_final numeric;
BEGIN
  -- base de cálculo
  IF p_plan_type = 'consultoria_bpo' THEN
    v_applicable_base := COALESCE(p_embedded_value, 0);
  ELSE
    v_applicable_base := COALESCE(p_base_price, 0);
  END IF;

  -- match de faixa
  SELECT id, name, discount_value
  INTO v_tier
  FROM public.discount_tiers
  WHERE is_active = true
    AND p_tpv >= tpv_min
    AND (tpv_max IS NULL OR p_tpv <= tpv_max)
  ORDER BY tpv_min DESC
  LIMIT 1;

  IF v_tier.id IS NOT NULL THEN
    v_discount := LEAST(v_tier.discount_value, v_applicable_base);
  END IF;

  v_final := GREATEST(0, COALESCE(p_base_price, 0) - v_discount);

  RETURN jsonb_build_object(
    'tier_id', v_tier.id,
    'tier_name', v_tier.name,
    'discount_applied', v_discount,
    'original_value', COALESCE(p_base_price, 0),
    'final_value', v_final
  );
END;
$$;