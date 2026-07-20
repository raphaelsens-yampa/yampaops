
-- 1) Nova coluna coupon_id em commission_reference
ALTER TABLE public.commission_reference
  ADD COLUMN IF NOT EXISTS coupon_id text;

-- Ajusta unicidade: (plan_name, payment_type, coupon_id) — NULL cupom = regra padrão
ALTER TABLE public.commission_reference
  DROP CONSTRAINT IF EXISTS commission_reference_plan_name_payment_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS commission_reference_plan_type_coupon_uniq
  ON public.commission_reference (plan_name, payment_type, COALESCE(coupon_id, ''));

-- 2) Atualiza apply_commission_from_stripe pra tentar regra com cupom antes da padrão
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
  v_base_mode   text := 'net';
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
  v_base_mode := COALESCE(v_settings.commission_base, 'net');

  IF v_sc.stripe_price_id IS NOT NULL THEN
    SELECT * INTO v_map FROM public.commission_price_map
      WHERE price_id = v_sc.stripe_price_id LIMIT 1;
  END IF;

  v_sale_month := date_trunc('month', v_sc.converted_at)::date;
  v_pay_month  := (v_sale_month + make_interval(months => COALESCE(v_settings.t_plus_months, 2)))::date;

  IF v_map.id IS NULL THEN
    v_status  := 'pending_mapping';
    IF v_base_mode = 'net' THEN
      v_mrr := COALESCE(v_sc.mrr_net, v_sc.mrr, 0);
    ELSE
      v_mrr := COALESCE(v_sc.mrr, 0);
    END IF;
    v_pct     := 0;
    v_amount  := 0;
    v_plan    := v_sc.plan_name;
    v_paytype := NULL;
    v_seller_id := v_sc.assigned_seller_id;
    v_seller_lbl := NULL;
  ELSE
    v_plan       := v_map.plan_name;
    v_paytype    := v_map.payment_type;
    IF v_base_mode = 'net' THEN
      v_mrr := COALESCE(v_sc.mrr_net, v_map.mrr_override, v_sc.mrr, 0);
    ELSE
      IF v_map.mrr_override IS NOT NULL THEN
        v_mrr := v_map.mrr_override;
      ELSE
        v_mrr := COALESCE(v_sc.mrr, 0);
      END IF;
    END IF;
    v_seller_id  := COALESCE(v_sc.assigned_seller_id, v_map.seller_user_id);
    v_seller_lbl := v_map.seller_label;

    IF COALESCE(v_map.requires_commission, true) = false THEN
      v_pct    := 0;
      v_amount := 0;
      v_status := 'calculated';
    ELSE
      -- 1) Tenta regra específica do cupom aplicado na conversão
      IF v_sc.coupon_id IS NOT NULL THEN
        SELECT * INTO v_ref FROM public.commission_reference
          WHERE plan_name = v_map.plan_name
            AND payment_type = v_map.payment_type
            AND coupon_id = v_sc.coupon_id
            AND is_active = true
          LIMIT 1;
      END IF;

      -- 2) Fallback: regra padrão (sem cupom)
      IF v_ref.id IS NULL THEN
        SELECT * INTO v_ref FROM public.commission_reference
          WHERE plan_name = v_map.plan_name
            AND payment_type = v_map.payment_type
            AND coupon_id IS NULL
            AND is_active = true
          LIMIT 1;
      END IF;

      IF v_ref.id IS NULL THEN
        v_pct    := 0;
        v_amount := 0;
        v_status := 'pending_mapping';
      ELSE
        v_pct := CASE WHEN v_map.payment_type = 'anual_avista'
                      THEN COALESCE(v_ref.av_pct, v_ref.commission_pct, 0)
                      ELSE COALESCE(v_ref.commission_pct, 0)
                 END;
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

-- 3) Função de validação de consistência do valor líquido
CREATE OR REPLACE FUNCTION public.validate_stripe_net_amount(p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sc public.stripe_conversions%ROWTYPE;
  v_issues text[] := ARRAY[]::text[];
  v_age_days int;
BEGIN
  SELECT * INTO v_sc FROM public.stripe_conversions WHERE id = p_id;
  IF NOT FOUND THEN RETURN v_issues; END IF;

  v_age_days := EXTRACT(DAY FROM (now() - COALESCE(v_sc.converted_at, v_sc.created_at)))::int;

  -- Não valida conversões sem valor (descartadas)
  IF COALESCE(v_sc.mrr, 0) <= 0 AND v_sc.stripe_invoice_id IS NULL THEN
    RETURN v_issues;
  END IF;

  IF v_sc.stripe_invoice_id IS NOT NULL AND v_sc.net_amount IS NULL THEN
    v_issues := v_issues || 'net_amount ausente apesar de invoice conhecida';
  END IF;

  IF v_sc.discount_amount > 0 AND v_sc.coupon_id IS NULL AND v_sc.promotion_code IS NULL THEN
    v_issues := v_issues || 'desconto aplicado sem cupom identificado';
  END IF;

  IF COALESCE(v_sc.net_amount_source, 'price_fallback') = 'price_fallback'
     AND v_age_days <= 30 AND v_sc.converted_at IS NOT NULL THEN
    v_issues := v_issues || 'sem lookup de invoice em conversão recente (<= 30 dias)';
  END IF;

  IF v_sc.gross_amount IS NOT NULL AND v_sc.net_amount IS NOT NULL
     AND ABS(v_sc.gross_amount - COALESCE(v_sc.discount_amount, 0) - v_sc.net_amount) > 0.02 THEN
    v_issues := v_issues || 'bruto - desconto != líquido (' ||
      to_char(v_sc.gross_amount, 'FM999999990.00') || ' - ' ||
      to_char(COALESCE(v_sc.discount_amount, 0), 'FM999999990.00') || ' != ' ||
      to_char(v_sc.net_amount, 'FM999999990.00') || ')';
  END IF;

  IF v_sc.net_amount IS NOT NULL AND v_sc.net_amount > 0 AND v_sc.mrr_net IS NULL THEN
    v_issues := v_issues || 'mrr_net ausente apesar de valor líquido positivo';
  END IF;

  IF v_sc.mrr > 0 AND v_sc.mrr_net IS NOT NULL AND v_sc.mrr_net > 0
     AND ABS(v_sc.mrr - v_sc.mrr_net) > 0.02 THEN
    v_issues := v_issues || 'mrr gravado difere do mrr_net (' ||
      to_char(v_sc.mrr, 'FM999999990.00') || ' vs ' ||
      to_char(v_sc.mrr_net, 'FM999999990.00') || ')';
  END IF;

  RETURN v_issues;
END;
$function$;

-- 4) Roda validação em lote, registra divergências e opcionalmente resolve antigas
CREATE OR REPLACE FUNCTION public.validate_stripe_net_amount_range(
  p_from timestamptz DEFAULT (now() - interval '400 days'),
  p_to   timestamptz DEFAULT now()
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_issues text[];
  v_scanned int := 0;
  v_flagged int := 0;
  v_cleared int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tatico')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT id FROM public.stripe_conversions
    WHERE converted_at BETWEEN p_from AND p_to
    ORDER BY converted_at
  LOOP
    v_scanned := v_scanned + 1;
    v_issues := public.validate_stripe_net_amount(r.id);

    IF array_length(v_issues, 1) IS NULL THEN
      -- Sem divergência: fecha alertas anteriores automaticamente
      UPDATE public.integration_sync_errors
        SET resolved = true
      WHERE entity_type = 'stripe_net_amount_mismatch'
        AND ac_id = r.id::text
        AND resolved = false;
      IF FOUND THEN v_cleared := v_cleared + 1; END IF;
    ELSE
      -- Fecha alertas antigos com motivo diferente e insere o atual
      UPDATE public.integration_sync_errors
        SET resolved = true
      WHERE entity_type = 'stripe_net_amount_mismatch'
        AND ac_id = r.id::text
        AND resolved = false
        AND error_message IS DISTINCT FROM array_to_string(v_issues, ' | ');

      -- Só insere se não houver um alerta idêntico ainda aberto
      IF NOT EXISTS (
        SELECT 1 FROM public.integration_sync_errors
         WHERE entity_type = 'stripe_net_amount_mismatch'
           AND ac_id = r.id::text
           AND resolved = false
           AND error_message = array_to_string(v_issues, ' | ')
      ) THEN
        INSERT INTO public.integration_sync_errors(
          entity_type, ac_id, error_message, payload, resolved
        ) VALUES (
          'stripe_net_amount_mismatch',
          r.id::text,
          array_to_string(v_issues, ' | '),
          (SELECT to_jsonb(x) FROM (
             SELECT id, customer_email, stripe_price_id, stripe_invoice_id,
                    mrr, mrr_net, gross_amount, net_amount, discount_amount,
                    coupon_id, coupon_name, promotion_code, net_amount_source,
                    converted_at
               FROM public.stripe_conversions WHERE id = r.id
           ) x),
          false
        );
        v_flagged := v_flagged + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'flagged', v_flagged,
    'cleared', v_cleared,
    'from', p_from,
    'to', p_to
  );
END;
$function$;
