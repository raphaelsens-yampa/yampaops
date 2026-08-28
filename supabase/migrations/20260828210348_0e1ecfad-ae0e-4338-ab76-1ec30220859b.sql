ALTER TABLE public.commission_conversions
  ADD COLUMN IF NOT EXISTS commissionable boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.apply_commissions_from_metabase(p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_month     date := date_trunc('month', COALESCE(p_month, v_today))::date;
  v_next      date;
  v_current   boolean;
  v_snapshot  date;
  v_settings  public.commission_settings%ROWTYPE;
  v_base_mode text := 'net';
  r           record;
  v_map       public.commission_price_map%ROWTYPE;
  v_ref       public.commission_reference%ROWTYPE;
  v_existing  public.commission_conversions%ROWTYPE;
  v_overrides text[];
  v_key       text;
  v_keys      text[] := '{}';
  v_type      text;
  v_mrr       numeric;
  v_pct       numeric;
  v_amount    numeric;
  v_pay_month date;
  v_new_pay   date;
  v_status    commission_conversion_status;
  v_base_kind text;
  v_seller_id uuid;
  v_seller_lbl text;
  v_seller_src text;
  v_plan      text;
  v_paytype   commission_payment_type;
  v_eligible  boolean;
  v_mult      numeric;
  v_commissionable boolean;
  v_created   integer := 0;
  v_updated   integer := 0;
  v_skipped   integer := 0;
  v_pending   integer := 0;
  v_removed   integer := 0;
  v_blocked   integer := 0;
BEGIN
  v_next := (v_month + interval '1 month')::date;
  v_current := (v_month = date_trunc('month', v_today)::date);

  SELECT * INTO v_settings FROM public.commission_settings LIMIT 1;
  IF NOT FOUND THEN
    v_settings.t_plus_months := 2;
    v_settings.commission_base := 'net';
    v_settings.eligible_new := true;
    v_settings.eligible_reactivation := true;
    v_settings.eligible_upsell := true;
    v_settings.mult_new := 1;
    v_settings.mult_reactivation := 1;
    v_settings.mult_upsell := 1;
    v_settings.upsell_base := 'delta';
  END IF;
  v_base_mode := COALESCE(v_settings.commission_base, 'net');
  v_pay_month := (v_month + make_interval(months => COALESCE(v_settings.t_plus_months, 2)))::date;

  v_new_pay := v_pay_month;
  WHILE public.commission_month_locked(v_new_pay) LOOP
    v_new_pay := (v_new_pay + interval '1 month')::date;
  END LOOP;

  -- Resolucao da fotografia: fechamento mensal do mes; senao ultima fotografia
  -- dentro do mes; para o mes vigente, a fotografia mais recente existente.
  SELECT MAX(data_snapshot) INTO v_snapshot
    FROM public.metas_ativos_pagantes_monthly WHERE mes_fechado = v_month;

  IF v_snapshot IS NULL THEN
    IF v_current THEN
      SELECT MAX(data_snapshot) INTO v_snapshot FROM public.metas_ativos_pagantes_daily;
    ELSE
      SELECT MAX(data_snapshot) INTO v_snapshot FROM public.metas_ativos_pagantes_daily
       WHERE data_snapshot >= v_month AND data_snapshot < v_next;
    END IF;
  END IF;

  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem fotografia da base Metabase para o mes', 'mes_venda', v_month);
  END IF;

  FOR r IN
    WITH mensal AS (
      SELECT m.company_id, m.email, m.plano, m.nome_oferta, m.stripe_price_id,
             m.mrr, m.previous_mrr, m.data_pagamento, m.origem_cliente,
             m.classificacao_company, m.gateway
        FROM public.metas_ativos_pagantes_monthly m
       WHERE m.mes_fechado = v_month
         AND m.data_snapshot = v_snapshot
         AND lower(coalesce(m.status_assinatura, '')) = 'ativo'
    ), fonte AS (
      SELECT * FROM mensal
      UNION ALL
      SELECT d.company_id, d.email, d.plano, d.nome_oferta, d.stripe_price_id,
             d.mrr, d.previous_mrr, d.data_pagamento, d.origem_cliente,
             d.classificacao_company, d.gateway
        FROM public.metas_ativos_pagantes_daily d
       WHERE d.data_snapshot = v_snapshot
         AND lower(coalesce(d.status_assinatura, '')) = 'ativo'
         AND NOT EXISTS (SELECT 1 FROM mensal)
    )
    SELECT DISTINCT ON (company_id, stripe_price_id, lower(classificacao_company)) *
      FROM fonte
     WHERE data_pagamento >= v_month
       AND data_pagamento < v_next
       AND lower(coalesce(classificacao_company, '')) IN ('novo pagante', 'recuperado', 'upsell')
     ORDER BY company_id, stripe_price_id, lower(classificacao_company), mrr DESC
  LOOP
    v_key := 'mb|' || to_char(v_month, 'YYYY-MM') || '|' || COALESCE(r.company_id, '')
             || '|' || COALESCE(r.stripe_price_id, '') || '|' || lower(COALESCE(r.classificacao_company, ''));
    v_keys := array_append(v_keys, v_key);

    v_commissionable := lower(COALESCE(r.origem_cliente, '')) <> '4blue';

    v_type := CASE lower(r.classificacao_company)
                WHEN 'recuperado' THEN 'reactivation'
                WHEN 'upsell'     THEN 'upsell'
                ELSE 'new'
              END;

    v_map := NULL;
    IF r.stripe_price_id IS NOT NULL THEN
      SELECT * INTO v_map FROM public.commission_price_map WHERE price_id = r.stripe_price_id LIMIT 1;
    END IF;

    v_seller_id  := v_map.seller_user_id;
    v_seller_lbl := v_map.seller_label;
    v_seller_src := CASE WHEN v_seller_id IS NOT NULL THEN 'price_map' ELSE NULL END;

    v_base_kind := 'mrr_total';
    v_ref := NULL;
    v_pct := 0;
    v_amount := 0;
    v_plan := COALESCE(v_map.plan_name, r.plano);
    v_paytype := v_map.payment_type;

    IF v_base_mode = 'net' THEN
      v_mrr := COALESCE(v_map.mrr_override, r.mrr, 0);
    ELSE
      v_mrr := COALESCE(r.mrr, 0);
    END IF;

    IF NOT v_commissionable THEN
      -- Origem 4blue: fica registrada, sem comissao e fora das pendencias
      v_status := 'ignored';
      IF v_type = 'upsell' AND COALESCE(v_settings.upsell_base, 'delta') = 'delta' THEN
        v_base_kind := 'mrr_delta';
        v_mrr := GREATEST(COALESCE(r.mrr, 0) - COALESCE(r.previous_mrr, 0), 0);
      END IF;
      v_pct := 0;
      v_amount := 0;
    ELSIF v_map.id IS NULL THEN
      v_status := 'pending_mapping';
      v_pending := v_pending + 1;
    ELSE
      v_status := 'calculated';

      IF v_type = 'reactivation' THEN
        v_eligible := COALESCE(v_settings.eligible_reactivation, true);
        v_mult := COALESCE(v_settings.mult_reactivation, 1);
      ELSIF v_type = 'upsell' THEN
        v_eligible := COALESCE(v_settings.eligible_upsell, true);
        v_mult := COALESCE(v_settings.mult_upsell, 1);
        IF COALESCE(v_settings.upsell_base, 'delta') = 'delta' THEN
          v_base_kind := 'mrr_delta';
          IF r.previous_mrr IS NULL THEN
            v_status := 'pending_mapping';
            v_pending := v_pending + 1;
            v_mrr := 0;
          ELSE
            v_mrr := GREATEST(COALESCE(r.mrr, 0) - r.previous_mrr, 0);
          END IF;
        END IF;
      ELSE
        v_eligible := COALESCE(v_settings.eligible_new, true);
        v_mult := COALESCE(v_settings.mult_new, 1);
      END IF;

      IF COALESCE(v_map.requires_commission, true) = false OR NOT v_eligible OR v_mrr <= 0 THEN
        v_pct := 0;
        v_amount := 0;
      ELSIF v_status = 'calculated' THEN
        SELECT * INTO v_ref FROM public.commission_reference
          WHERE plan_name = v_map.plan_name
            AND payment_type = v_map.payment_type
            AND coupon_id IS NULL
            AND is_active = true
          LIMIT 1;

        IF v_ref.id IS NULL THEN
          v_pct := 0;
          v_amount := 0;
          v_status := 'pending_mapping';
          v_pending := v_pending + 1;
        ELSE
          v_pct := CASE WHEN v_map.payment_type = 'anual_avista'
                        THEN COALESCE(v_ref.av_pct, v_ref.commission_pct, 0)
                        ELSE COALESCE(v_ref.commission_pct, 0) END;
          v_pct := ROUND(v_pct * COALESCE(v_mult, 1), 6);
          v_amount := ROUND(v_mrr * v_pct, 2);
        END IF;
      END IF;
    END IF;

    IF v_seller_lbl IS NULL AND v_seller_id IS NOT NULL THEN
      SELECT COALESCE(p.full_name, p.email) INTO v_seller_lbl
        FROM public.profiles p WHERE p.user_id = v_seller_id;
    END IF;

    SELECT * INTO v_existing FROM public.commission_conversions WHERE metabase_key = v_key LIMIT 1;

    IF v_existing.id IS NULL THEN
      INSERT INTO public.commission_conversions (
        source, metabase_key, sale_month, payment_month, company_id,
        customer_email, price_id, offer_name, gateway, mrr,
        origem_cliente, resolved_plan, resolved_payment_type,
        resolved_seller_user_id, resolved_seller_label, seller_source,
        conversion_type, base_kind, commission_pct, commission_amount, status,
        commissionable
      ) VALUES (
        'metabase', v_key, v_month, v_new_pay, r.company_id,
        r.email, r.stripe_price_id, COALESCE(v_map.offer_name, r.nome_oferta), COALESCE(r.gateway, 'stripe'), v_mrr,
        r.origem_cliente, v_plan, v_paytype,
        v_seller_id, v_seller_lbl, v_seller_src,
        v_type, v_base_kind, v_pct, v_amount, v_status,
        v_commissionable
      );
      v_created := v_created + 1;
      CONTINUE;
    END IF;

    IF public.commission_month_locked(v_existing.payment_month) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_overrides := COALESCE(v_existing.override_fields, '{}'::text[]);

    UPDATE public.commission_conversions SET
      sale_month              = CASE WHEN v_existing.manually_reviewed AND 'sale_month' = ANY(v_overrides) THEN sale_month ELSE v_month END,
      payment_month           = CASE WHEN v_existing.manually_reviewed AND 'payment_month' = ANY(v_overrides) THEN payment_month ELSE v_new_pay END,
      mrr                     = CASE WHEN v_existing.manually_reviewed AND 'mrr' = ANY(v_overrides) THEN mrr ELSE v_mrr END,
      resolved_plan           = CASE WHEN v_existing.manually_reviewed AND 'resolved_plan' = ANY(v_overrides) THEN resolved_plan ELSE v_plan END,
      resolved_payment_type   = CASE WHEN v_existing.manually_reviewed AND 'resolved_payment_type' = ANY(v_overrides) THEN resolved_payment_type ELSE v_paytype END,
      resolved_seller_user_id = CASE WHEN v_existing.resolved_seller_user_id IS NOT NULL AND v_seller_id IS NULL THEN resolved_seller_user_id
                                     WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN resolved_seller_user_id
                                     ELSE COALESCE(v_seller_id, resolved_seller_user_id) END,
      resolved_seller_label   = CASE WHEN v_existing.resolved_seller_user_id IS NOT NULL AND v_seller_id IS NULL THEN resolved_seller_label
                                     WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN resolved_seller_label
                                     ELSE COALESCE(v_seller_lbl, resolved_seller_label) END,
      seller_source           = CASE WHEN v_existing.resolved_seller_user_id IS NOT NULL AND v_seller_id IS NULL THEN seller_source
                                     WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN 'manual'
                                     ELSE COALESCE(v_seller_src, seller_source) END,
      conversion_type         = v_type,
      base_kind               = CASE WHEN v_existing.manually_reviewed AND 'mrr' = ANY(v_overrides) THEN base_kind ELSE v_base_kind END,
      commission_pct          = CASE WHEN NOT v_commissionable THEN 0
                                     WHEN v_existing.manually_reviewed AND 'commission_pct' = ANY(v_overrides) THEN commission_pct ELSE v_pct END,
      commission_amount       = CASE WHEN NOT v_commissionable THEN 0
                                     WHEN v_existing.manually_reviewed AND 'commission_amount' = ANY(v_overrides) THEN commission_amount ELSE v_amount END,
      status                  = CASE WHEN NOT v_commissionable THEN 'ignored'::commission_conversion_status
                                     WHEN v_existing.manually_reviewed AND 'status' = ANY(v_overrides) THEN status ELSE v_status END,
      commissionable          = v_commissionable,
      price_id                = r.stripe_price_id,
      offer_name              = COALESCE(v_map.offer_name, r.nome_oferta),
      customer_email          = r.email,
      company_id              = r.company_id,
      origem_cliente          = r.origem_cliente,
      updated_at              = now()
    WHERE id = v_existing.id;
    v_updated := v_updated + 1;
  END LOOP;

  -- Linhas Metabase do mes que sairam da fotografia: remove, salvo revisao manual
  -- ou mes de pagamento fechado (nesses casos ficam como estao).
  SELECT count(*) INTO v_blocked
    FROM public.commission_conversions c
   WHERE c.source = 'metabase' AND c.sale_month = v_month
     AND NOT (c.metabase_key = ANY(v_keys))
     AND (c.manually_reviewed OR public.commission_month_locked(c.payment_month));

  WITH del AS (
    DELETE FROM public.commission_conversions c
     WHERE c.source = 'metabase' AND c.sale_month = v_month
       AND NOT (c.metabase_key = ANY(v_keys))
       AND NOT c.manually_reviewed
       AND NOT public.commission_month_locked(c.payment_month)
     RETURNING 1
  ) SELECT count(*) INTO v_removed FROM del;

  RETURN jsonb_build_object(
    'ok', true, 'mes_venda', v_month, 'mes_pagamento', v_new_pay, 'snapshot', v_snapshot,
    'criadas', v_created, 'atualizadas', v_updated,
    'pendentes', v_pending, 'ignoradas_mes_fechado', v_skipped,
    'removidas', v_removed, 'obsoletas_preservadas', v_blocked
  );
END;
$function$;