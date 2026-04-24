-- 1. Adiciona colunas Stripe ao catálogo de produtos
ALTER TABLE public.commission_products
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS price_name text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS seller_id uuid;

-- 2. Índice único parcial: cada Stripe Price ID só pode existir 1x
CREATE UNIQUE INDEX IF NOT EXISTS commission_products_stripe_price_id_key
  ON public.commission_products(stripe_price_id)
  WHERE stripe_price_id IS NOT NULL;

-- 3. Migrar dados de stripe_prices para commission_products
-- Caso A: stripe_price tem commission_product_id E o produto AINDA não tem stripe_price_id → fundir no produto existente
UPDATE public.commission_products cp
SET
  stripe_price_id = sp.price_id,
  price_name      = sp.price_name,
  area            = COALESCE(cp.area, sp.area),
  seller_id       = COALESCE(cp.seller_id, sp.seller_id),
  -- Se stripe_price tinha % override > 0, prevalece
  commission_percent = CASE WHEN COALESCE(sp.commission_percent, 0) > 0 THEN sp.commission_percent ELSE cp.commission_percent END,
  -- MRR do stripe_price prevalece se preenchido
  plan_mrr = CASE WHEN COALESCE(sp.mrr, 0) > 0 THEN sp.mrr ELSE cp.plan_mrr END,
  updated_at = now()
FROM public.stripe_prices sp
WHERE sp.commission_product_id = cp.id
  AND cp.stripe_price_id IS NULL;

-- Caso B: stripe_price com commission_product_id mas produto JÁ tem outro stripe_price_id
-- → criar nova linha (variante) no catálogo, copiando dados do produto base
INSERT INTO public.commission_products
  (product_id, name, plan_name, periodicity, plan_value, plan_mrr,
   commission_percent, commission_base,
   stripe_price_id, price_name, area, seller_id)
SELECT
  cp.product_id, cp.name, cp.plan_name, cp.periodicity, cp.plan_value,
  CASE WHEN COALESCE(sp.mrr, 0) > 0 THEN sp.mrr ELSE cp.plan_mrr END,
  CASE WHEN COALESCE(sp.commission_percent, 0) > 0 THEN sp.commission_percent ELSE cp.commission_percent END,
  cp.commission_base,
  sp.price_id, sp.price_name, sp.area, sp.seller_id
FROM public.stripe_prices sp
JOIN public.commission_products cp ON cp.id = sp.commission_product_id
WHERE cp.stripe_price_id IS NOT NULL
  AND cp.stripe_price_id <> sp.price_id
  AND NOT EXISTS (
    SELECT 1 FROM public.commission_products cp2 WHERE cp2.stripe_price_id = sp.price_id
  );

-- Caso C: stripe_price sem commission_product_id → cria produto novo a partir do stripe_price
INSERT INTO public.commission_products
  (name, plan_name, periodicity, plan_value, plan_mrr,
   commission_percent, commission_base,
   stripe_price_id, price_name, area, seller_id)
SELECT
  COALESCE(NULLIF(sp.product_name, ''), 'Produto Stripe'),
  COALESCE(sp.plan_name, ''),
  'Mensal',
  COALESCE(sp.mrr, 0),
  COALESCE(sp.mrr, 0),
  COALESCE(sp.commission_percent, 0),
  'mrr',
  sp.price_id, sp.price_name, sp.area, sp.seller_id
FROM public.stripe_prices sp
WHERE sp.commission_product_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.commission_products cp WHERE cp.stripe_price_id = sp.price_id
  );

-- 4. Atualiza trigger de geração de comissão para usar APENAS commission_products como fonte
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
  v_payment_month date;
  v_sale_date date;
  v_existing_count int;
  v_new_is_won boolean := false;
  v_old_is_won boolean := false;
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

  -- Garantir 1 comissão por oportunidade
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

  -- Resolve produto: prioriza match por stripe_price_id, depois por product_id
  IF NEW.stripe_price_id IS NOT NULL THEN
    SELECT * INTO v_product
    FROM commission_products
    WHERE stripe_price_id = NEW.stripe_price_id
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_product.id IS NULL THEN
    IF NEW.product_id IS NULL THEN
      RAISE LOG 'generate_commission_on_won: opportunity % sem product_id e sem match por stripe_price_id', NEW.id;
      RETURN NEW;
    END IF;
    SELECT * INTO v_product FROM commission_products WHERE id = NEW.product_id;
    IF NOT FOUND THEN
      RAISE LOG 'generate_commission_on_won: product % não encontrado', NEW.product_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Aplica base de cálculo
  IF v_product.commission_base = 'value' THEN
    v_commission_base_amount := COALESCE(v_product.plan_value, 0);
  ELSE
    v_commission_base_amount := COALESCE(v_product.plan_mrr, NEW.estimated_mrr, 0);
  END IF;

  v_commission_amount := v_commission_base_amount * COALESCE(v_product.commission_percent, 0) / 100;

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
    COALESCE(v_product.seller_id, NEW.consultant_id, '00000000-0000-0000-0000-000000000000'),
    v_product.id,
    v_sale_date,
    v_payment_month,
    v_commission_amount,
    'earned',
    'provisioned'
  );

  RAISE LOG 'Commission generated: opp=%, product=%, base=%, amount=%, payment=%',
    NEW.id, v_product.id, v_commission_base_amount, v_commission_amount, v_payment_month;
  RETURN NEW;
END;
$function$;