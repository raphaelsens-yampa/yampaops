
CREATE OR REPLACE FUNCTION public.generate_commission_on_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product commission_products%ROWTYPE;
  v_settings commission_settings%ROWTYPE;
  v_commission_amount numeric;
  v_payment_month date;
  v_sale_date date;
  v_existing_count int;
BEGIN
  -- Only fire when stage changes TO fechado_won
  IF NEW.stage <> 'fechado_won' THEN
    RETURN NEW;
  END IF;
  IF OLD.stage = 'fechado_won' THEN
    RETURN NEW; -- already was won, skip
  END IF;

  -- Check if commission already exists for this opportunity
  SELECT count(*) INTO v_existing_count
  FROM commissions
  WHERE opportunity_id = NEW.id AND type = 'earned';
  
  IF v_existing_count > 0 THEN
    RETURN NEW; -- already generated
  END IF;

  -- Get product info
  IF NEW.product_id IS NULL THEN
    RAISE LOG 'generate_commission_on_won: no product_id for opportunity %', NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM commission_products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE LOG 'generate_commission_on_won: product % not found', NEW.product_id;
    RETURN NEW;
  END IF;

  -- Get settings
  SELECT * INTO v_settings FROM commission_settings LIMIT 1;
  IF NOT FOUND THEN
    -- Use defaults
    v_settings.t_plus_months := 2;
    v_settings.payment_day := 10;
  END IF;

  -- Calculate commission
  v_sale_date := CURRENT_DATE;
  v_commission_amount := COALESCE(NEW.estimated_mrr, 0) * v_product.commission_percent / 100;

  -- Calculate payment month: sale date + T+ months, on payment_day
  v_payment_month := (date_trunc('month', v_sale_date) + (v_settings.t_plus_months || ' months')::interval)::date
                     + (v_settings.payment_day - 1);

  -- Ensure we don't exceed month bounds
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
    NEW.product_id,
    v_sale_date,
    v_payment_month,
    v_commission_amount,
    'earned',
    'provisioned'
  );

  RAISE LOG 'Commission generated: opportunity=%, amount=%, payment=%', NEW.id, v_commission_amount, v_payment_month;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_commission_on_won
  AFTER UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_commission_on_won();
