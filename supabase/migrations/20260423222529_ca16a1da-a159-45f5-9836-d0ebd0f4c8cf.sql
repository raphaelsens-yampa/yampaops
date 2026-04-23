
-- 1. Novos campos em opportunities
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_pending_since timestamptz,
  ADD COLUMN IF NOT EXISTS previous_stage text;

CREATE INDEX IF NOT EXISTS idx_opportunities_stripe_customer ON public.opportunities (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_stripe_subscription ON public.opportunities (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- 2. Tabela stripe_events (idempotência)
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text,
  matched_opportunity_id uuid,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage stripe_events"
  ON public.stripe_events
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Marcar etapas Ganho/Perdido no pipeline padrão (necessário para o trigger)
UPDATE public.pipeline_stages
  SET is_won = true
  WHERE pipeline_id = 'ad7d090f-dc11-4d78-a537-6d136737b5b6'::uuid
    AND slug = 'ganho';

UPDATE public.pipeline_stages
  SET is_lost = true
  WHERE pipeline_id = 'ad7d090f-dc11-4d78-a537-6d136737b5b6'::uuid
    AND slug = 'perdido';

-- 4. Inserir etapa "Pendências Stripe" antes da etapa Ganho (position=12)
-- Primeiro empurra Ganho/Perdido para frente
UPDATE public.pipeline_stages
  SET position = position + 1
  WHERE pipeline_id = 'ad7d090f-dc11-4d78-a537-6d136737b5b6'::uuid
    AND position >= 12;

INSERT INTO public.pipeline_stages (pipeline_id, name, slug, position, color, is_won, is_lost)
SELECT 'ad7d090f-dc11-4d78-a537-6d136737b5b6'::uuid, 'Pendências Stripe', 'pendencias_stripe', 12, '#f59e0b', false, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.pipeline_stages
  WHERE pipeline_id = 'ad7d090f-dc11-4d78-a537-6d136737b5b6'::uuid
    AND slug = 'pendencias_stripe'
);

-- 5. Atualizar função de geração de comissão: usar is_won + suportar stripe_price_id
CREATE OR REPLACE FUNCTION public.generate_commission_on_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product commission_products%ROWTYPE;
  v_settings commission_settings%ROWTYPE;
  v_commission_amount numeric;
  v_commission_product_id uuid;
  v_payment_month date;
  v_sale_date date;
  v_existing_count int;
  v_new_is_won boolean := false;
  v_old_is_won boolean := false;
  v_stripe_price stripe_prices%ROWTYPE;
BEGIN
  -- Determine if the NEW stage is a "won" stage
  SELECT COALESCE(is_won, false) INTO v_new_is_won
  FROM pipeline_stages
  WHERE pipeline_id = NEW.pipeline_id AND slug = NEW.stage
  LIMIT 1;

  -- Determine if OLD was already won
  IF OLD.stage IS NOT NULL THEN
    SELECT COALESCE(is_won, false) INTO v_old_is_won
    FROM pipeline_stages
    WHERE pipeline_id = OLD.pipeline_id AND slug = OLD.stage
    LIMIT 1;
  END IF;

  -- Backwards compat: also accept legacy 'fechado_won' slug
  IF NEW.stage = 'fechado_won' THEN
    v_new_is_won := true;
  END IF;
  IF OLD.stage = 'fechado_won' THEN
    v_old_is_won := true;
  END IF;

  -- Only fire on transition INTO a won stage
  IF NOT v_new_is_won THEN
    RETURN NEW;
  END IF;
  IF v_old_is_won THEN
    RETURN NEW;
  END IF;

  -- Skip if commission already exists
  SELECT count(*) INTO v_existing_count
  FROM commissions
  WHERE opportunity_id = NEW.id AND type = 'earned';
  IF v_existing_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Get settings (fallback defaults)
  SELECT * INTO v_settings FROM commission_settings LIMIT 1;
  IF NOT FOUND THEN
    v_settings.t_plus_months := 2;
    v_settings.payment_day := 10;
  END IF;

  v_sale_date := CURRENT_DATE;

  -- Path 1: Stripe price_id present → use stripe_prices table
  IF NEW.stripe_price_id IS NOT NULL THEN
    SELECT * INTO v_stripe_price
    FROM stripe_prices
    WHERE price_id = NEW.stripe_price_id
    LIMIT 1;

    IF FOUND THEN
      v_commission_amount := COALESCE(v_stripe_price.commission_value, 0);
      v_commission_product_id := v_stripe_price.commission_product_id;
    END IF;
  END IF;

  -- Path 2: Fallback to commission_products via product_id
  IF v_commission_amount IS NULL THEN
    IF NEW.product_id IS NULL THEN
      RAISE LOG 'generate_commission_on_won: no product_id and no stripe price match for opportunity %', NEW.id;
      RETURN NEW;
    END IF;

    SELECT * INTO v_product FROM commission_products WHERE id = NEW.product_id;
    IF NOT FOUND THEN
      RAISE LOG 'generate_commission_on_won: product % not found', NEW.product_id;
      RETURN NEW;
    END IF;

    v_commission_amount := COALESCE(NEW.estimated_mrr, 0) * v_product.commission_percent / 100;
    v_commission_product_id := v_product.id;
  END IF;

  -- Compute payment month
  v_payment_month := make_date(
    EXTRACT(YEAR FROM (date_trunc('month', v_sale_date) + (v_settings.t_plus_months || ' months')::interval))::int,
    EXTRACT(MONTH FROM (date_trunc('month', v_sale_date) + (v_settings.t_plus_months || ' months')::interval))::int,
    LEAST(v_settings.payment_day, EXTRACT(DAY FROM (date_trunc('month', date_trunc('month', v_sale_date) + (v_settings.t_plus_months || ' months')::interval) + interval '1 month' - interval '1 day'))::int)
  );

  INSERT INTO commissions (
    opportunity_id, seller_id, product_id, sale_date, payment_month,
    commission_amount, type, status
  ) VALUES (
    NEW.id,
    COALESCE(NEW.consultant_id, '00000000-0000-0000-0000-000000000000'),
    v_commission_product_id,
    v_sale_date,
    v_payment_month,
    v_commission_amount,
    'earned',
    'provisioned'
  );

  RAISE LOG 'Commission generated: opportunity=%, amount=%, payment=%, source=%', NEW.id, v_commission_amount, v_payment_month, CASE WHEN NEW.stripe_price_id IS NOT NULL THEN 'stripe' ELSE 'product' END;
  RETURN NEW;
END;
$function$;

-- 6. Garantir que o trigger existe (se ainda não foi criado)
DROP TRIGGER IF EXISTS trg_generate_commission_on_won ON public.opportunities;
CREATE TRIGGER trg_generate_commission_on_won
AFTER UPDATE OF stage ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.generate_commission_on_won();
