
ALTER TABLE public.commission_conversions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stripe_conversion_id uuid NULL REFERENCES public.stripe_conversions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS override_fields text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commission_conversions_source_check'
      AND conrelid = 'public.commission_conversions'::regclass
  ) THEN
    ALTER TABLE public.commission_conversions
      ADD CONSTRAINT commission_conversions_source_check
      CHECK (source IN ('stripe','manual','import'));
  END IF;
END $$;

UPDATE public.commission_conversions
   SET source = 'import'
 WHERE source = 'manual' AND import_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_conversions_stripe_unique
  ON public.commission_conversions(stripe_conversion_id)
  WHERE source = 'stripe' AND stripe_conversion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commission_conversions_source_idx
  ON public.commission_conversions(source);

CREATE TABLE IF NOT EXISTS public.commission_conversion_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.commission_conversions(id) ON DELETE CASCADE,
  edited_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL DEFAULT 'update',
  diff jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS commission_conversion_edits_conversion_idx
  ON public.commission_conversion_edits(conversion_id);

GRANT SELECT, INSERT ON public.commission_conversion_edits TO authenticated;
GRANT ALL ON public.commission_conversion_edits TO service_role;

ALTER TABLE public.commission_conversion_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read all commission edits" ON public.commission_conversion_edits;
CREATE POLICY "Admins read all commission edits"
  ON public.commission_conversion_edits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Sellers read own commission edits" ON public.commission_conversion_edits;
CREATE POLICY "Sellers read own commission edits"
  ON public.commission_conversion_edits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.commission_conversions cc
      WHERE cc.id = commission_conversion_edits.conversion_id
        AND cc.resolved_seller_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins insert commission edits" ON public.commission_conversion_edits;
CREATE POLICY "Admins insert commission edits"
  ON public.commission_conversion_edits FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.apply_commission_from_stripe(p_stripe_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sc          public.stripe_conversions%ROWTYPE;
  v_map         public.commission_price_map%ROWTYPE;
  v_ref         public.commission_reference%ROWTYPE;
  v_settings    public.commission_settings%ROWTYPE;
  v_existing    public.commission_conversions%ROWTYPE;
  v_mrr         numeric := 0;
  v_pct         numeric := 0;
  v_amount      numeric := 0;
  v_sale_month  date;
  v_pay_month   date;
  v_status      commission_conversion_status := 'calculated';
  v_seller_id   uuid;
  v_seller_lbl  text;
  v_plan        text;
  v_paytype     commission_payment_type;
  v_row_id      uuid;
  v_overrides   text[];
BEGIN
  SELECT * INTO v_sc FROM public.stripe_conversions WHERE id = p_stripe_id;
  IF NOT FOUND OR v_sc.converted_at IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings FROM public.commission_settings LIMIT 1;
  IF NOT FOUND THEN
    v_settings.t_plus_months := 2;
    v_settings.payment_day := 10;
  END IF;

  IF v_sc.stripe_price_id IS NOT NULL THEN
    SELECT * INTO v_map FROM public.commission_price_map
      WHERE price_id = v_sc.stripe_price_id LIMIT 1;
  END IF;

  v_sale_month := date_trunc('month', v_sc.converted_at)::date;
  v_pay_month  := (v_sale_month + make_interval(months => COALESCE(v_settings.t_plus_months, 2)))::date;

  IF v_map.id IS NULL THEN
    v_status  := 'pending_mapping';
    v_mrr     := COALESCE(v_sc.mrr, 0);
    v_pct     := 0;
    v_amount  := 0;
    v_plan    := v_sc.plan_name;
    v_paytype := NULL;
    v_seller_id := v_sc.assigned_seller_id;
    v_seller_lbl := NULL;
  ELSE
    v_plan       := v_map.plan_name;
    v_paytype    := v_map.payment_type;
    v_mrr        := COALESCE(v_map.mrr_override, v_sc.mrr, 0);
    v_seller_id  := COALESCE(v_sc.assigned_seller_id, v_map.seller_user_id);
    v_seller_lbl := v_map.seller_label;

    IF COALESCE(v_map.requires_commission, true) = false THEN
      v_pct    := 0;
      v_amount := 0;
      v_status := 'calculated';
    ELSE
      SELECT * INTO v_ref FROM public.commission_reference
        WHERE plan_name = v_map.plan_name
          AND payment_type = v_map.payment_type
          AND is_active = true
        LIMIT 1;
      IF v_ref.id IS NULL THEN
        v_pct    := 0;
        v_amount := 0;
        v_status := 'pending_mapping';
      ELSE
        v_pct := CASE WHEN v_map.payment_type = 'anual_avista'
                      THEN COALESCE(v_ref.av_pct, v_ref.commission_pct, 0)
                      ELSE COALESCE(v_ref.commission_pct, 0)
                 END;
        v_amount := ROUND(v_mrr * v_pct / 100, 2);
        v_status := 'calculated';
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_existing FROM public.commission_conversions
    WHERE source = 'stripe' AND stripe_conversion_id = p_stripe_id
    LIMIT 1;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.commission_conversions (
      source, stripe_conversion_id, import_id,
      sale_month, payment_month,
      customer_email,
      price_id, offer_name, gateway, mrr,
      resolved_plan, resolved_payment_type,
      resolved_seller_user_id, resolved_seller_label,
      commission_pct, commission_amount, status,
      origem_cliente
    ) VALUES (
      'stripe', p_stripe_id, NULL,
      v_sale_month, v_pay_month,
      v_sc.customer_email,
      v_sc.stripe_price_id, COALESCE(v_map.offer_name, v_sc.product_name),
      'stripe', v_mrr,
      v_plan, v_paytype,
      v_seller_id, v_seller_lbl,
      v_pct, v_amount, v_status,
      'stripe'
    )
    RETURNING id INTO v_row_id;
    RETURN v_row_id;
  END IF;

  v_overrides := COALESCE(v_existing.override_fields, '{}'::text[]);

  UPDATE public.commission_conversions SET
    sale_month              = CASE WHEN v_existing.manually_reviewed AND 'sale_month'              = ANY(v_overrides) THEN sale_month              ELSE v_sale_month END,
    payment_month           = CASE WHEN v_existing.manually_reviewed AND 'payment_month'           = ANY(v_overrides) THEN payment_month           ELSE v_pay_month  END,
    mrr                     = CASE WHEN v_existing.manually_reviewed AND 'mrr'                     = ANY(v_overrides) THEN mrr                     ELSE v_mrr        END,
    resolved_plan           = CASE WHEN v_existing.manually_reviewed AND 'resolved_plan'           = ANY(v_overrides) THEN resolved_plan           ELSE v_plan       END,
    resolved_payment_type   = CASE WHEN v_existing.manually_reviewed AND 'resolved_payment_type'   = ANY(v_overrides) THEN resolved_payment_type   ELSE v_paytype    END,
    resolved_seller_user_id = CASE WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN resolved_seller_user_id ELSE v_seller_id  END,
    resolved_seller_label   = CASE WHEN v_existing.manually_reviewed AND 'resolved_seller_label'   = ANY(v_overrides) THEN resolved_seller_label   ELSE v_seller_lbl END,
    commission_pct          = CASE WHEN v_existing.manually_reviewed AND 'commission_pct'          = ANY(v_overrides) THEN commission_pct          ELSE v_pct        END,
    commission_amount       = CASE WHEN v_existing.manually_reviewed AND 'commission_amount'       = ANY(v_overrides) THEN commission_amount       ELSE v_amount     END,
    status                  = CASE WHEN v_existing.manually_reviewed AND 'status'                  = ANY(v_overrides) THEN status                  ELSE v_status     END,
    price_id                = v_sc.stripe_price_id,
    offer_name              = COALESCE(v_map.offer_name, v_sc.product_name),
    customer_email          = v_sc.customer_email,
    updated_at              = now()
  WHERE id = v_existing.id;

  RETURN v_existing.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_commissions_from_stripe_range(
  p_from timestamptz DEFAULT (now() - interval '90 days'),
  p_to   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_total int := 0;
  v_pending int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT id FROM public.stripe_conversions
    WHERE converted_at BETWEEN p_from AND p_to
    ORDER BY converted_at
  LOOP
    PERFORM public.apply_commission_from_stripe(r.id);
    v_total := v_total + 1;
  END LOOP;

  SELECT count(*) INTO v_pending
    FROM public.commission_conversions
   WHERE source = 'stripe' AND status = 'pending_mapping';

  RETURN jsonb_build_object(
    'processed', v_total,
    'pending_mapping', v_pending,
    'from', p_from,
    'to', p_to
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_apply_commission_from_stripe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.converted_at IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.apply_commission_from_stripe(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stripe_conversions_apply_commission ON public.stripe_conversions;
CREATE TRIGGER stripe_conversions_apply_commission
AFTER INSERT OR UPDATE OF mrr, converted_at, assigned_seller_id, stripe_price_id
ON public.stripe_conversions
FOR EACH ROW
EXECUTE FUNCTION public.trg_apply_commission_from_stripe();
