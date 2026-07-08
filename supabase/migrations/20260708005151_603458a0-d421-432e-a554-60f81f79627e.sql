
CREATE OR REPLACE FUNCTION public.apply_commission_from_stripe(p_stripe_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- commission_pct is stored as a decimal fraction (0.05 = 5%),
        -- so multiply directly by MRR without dividing by 100.
        v_amount := ROUND(v_mrr * v_pct, 2);
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
$function$;

-- Backfill: recalcula todas as conversões automáticas do Stripe já existentes
-- (respeita as revisadas manualmente que travaram commission_amount)
UPDATE public.commission_conversions cc
SET
  commission_amount = ROUND(cc.mrr * cc.commission_pct, 2),
  updated_at        = now()
WHERE cc.source = 'stripe'
  AND cc.status  = 'calculated'
  AND cc.commission_pct > 0
  AND NOT (COALESCE(cc.manually_reviewed, false) AND 'commission_amount' = ANY(COALESCE(cc.override_fields, '{}'::text[])));
