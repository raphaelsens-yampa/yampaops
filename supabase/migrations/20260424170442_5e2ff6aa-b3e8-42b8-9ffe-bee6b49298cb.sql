-- Add commission_base to commission_products: 'value' (sobre Valor do plano) ou 'mrr' (sobre MRR)
ALTER TABLE public.commission_products
ADD COLUMN IF NOT EXISTS commission_base text NOT NULL DEFAULT 'mrr';

ALTER TABLE public.commission_products
DROP CONSTRAINT IF EXISTS commission_products_commission_base_check;

ALTER TABLE public.commission_products
ADD CONSTRAINT commission_products_commission_base_check
CHECK (commission_base IN ('value', 'mrr'));

-- Update generate_commission_on_won to respect commission_base
-- Yampa rule: comissão sempre sobre o PRIMEIRO recebimento.
-- Se base = 'value' → usa plan_value (valor cheio do primeiro recebimento)
-- Se base = 'mrr'   → usa plan_mrr (ou estimated_mrr se plan_mrr = 0)
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
  v_commission_base_amount numeric;
  v_commission_product_id uuid;
  v_payment_month date;
  v_sale_date date;
  v_existing_count int;
  v_new_is_won boolean := false;
  v_old_is_won boolean := false;
  v_stripe_price stripe_prices%ROWTYPE;
BEGIN
  SELECT COALESCE(is_won, false) INTO v_new_is_won
  FROM pipeline_stages
  WHERE pipeline_id = NEW.pipeline_id AND slug = NEW.stage
  LIMIT 1;

  IF OLD.stage IS NOT NULL THEN
    SELECT COALESCE(is_won, false) INTO v_old_is_won
    FROM pipeline_stages
    WHERE pipeline_id = OLD.pipeline_id AND slug = OLD.stage
    LIMIT 1;
  END IF;

  IF NEW.stage = 'fechado_won' THEN v_new_is_won := true; END IF;
  IF OLD.stage = 'fechado_won' THEN v_old_is_won := true; END IF;

  IF NOT v_new_is_won THEN RETURN NEW; END IF;
  IF v_old_is_won THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_existing_count
  FROM commissions
  WHERE opportunity_id = NEW.id AND type = 'earned';
  IF v_existing_count > 0 THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM commission_settings LIMIT 1;
  IF NOT FOUND THEN
    v_settings.t_plus_months := 2;
    v_settings.payment_day := 10;
  END IF;

  v_sale_date := CURRENT_DATE;

  -- Path 1: Stripe price_id present
  IF NEW.stripe_price_id IS NOT NULL THEN
    SELECT * INTO v_stripe_price
    FROM stripe_prices
    WHERE price_id = NEW.stripe_price_id
    LIMIT 1;

    IF FOUND THEN
      v_commission_product_id := v_stripe_price.commission_product_id;

      -- Resolve base via commission_products
      IF v_commission_product_id IS NOT NULL THEN
        SELECT * INTO v_product FROM commission_products WHERE id = v_commission_product_id;
        IF FOUND THEN
          IF v_product.commission_base = 'value' THEN
            v_commission_base_amount := COALESCE(v_product.plan_value, 0);
          ELSE
            v_commission_base_amount := COALESCE(v_stripe_price.mrr, v_product.plan_mrr, 0);
          END IF;
          v_commission_amount := v_commission_base_amount * COALESCE(v_stripe_price.commission_percent, v_product.commission_percent, 0) / 100;
        END IF;
      END IF;

      -- Fallback: use stripe_price.commission_value diretamente se não resolveu
      IF v_commission_amount IS NULL THEN
        v_commission_amount := COALESCE(v_stripe_price.commission_value, 0);
      END IF;
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

    IF v_product.commission_base = 'value' THEN
      v_commission_base_amount := COALESCE(v_product.plan_value, 0);
    ELSE
      v_commission_base_amount := COALESCE(NEW.estimated_mrr, v_product.plan_mrr, 0);
    END IF;

    v_commission_amount := v_commission_base_amount * v_product.commission_percent / 100;
    v_commission_product_id := v_product.id;
  END IF;

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

  RAISE LOG 'Commission generated: opportunity=%, base=%, amount=%, payment=%',
    NEW.id, v_commission_base_amount, v_commission_amount, v_payment_month;
  RETURN NEW;
END;
$function$;