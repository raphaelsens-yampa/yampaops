-- 1. Settings: elegibilidade / multiplicadores por tipo de conversão
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS eligible_new boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS eligible_reactivation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS eligible_upsell boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS eligible_renewal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eligible_downgrade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mult_new numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mult_reactivation numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mult_upsell numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS upsell_base text NOT NULL DEFAULT 'delta',
  ADD COLUMN IF NOT EXISTS clawback_enabled boolean NOT NULL DEFAULT false;

-- 2. Conversões: auditoria da atribuição e da base
ALTER TABLE public.commission_conversions
  ADD COLUMN IF NOT EXISTS seller_source text,
  ADD COLUMN IF NOT EXISTS conversion_type text,
  ADD COLUMN IF NOT EXISTS base_kind text;

-- 3. Fechamento por mês de pagamento
CREATE TABLE IF NOT EXISTS public.commission_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_month date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open',
  total_commission numeric NOT NULL DEFAULT 0,
  total_clawback numeric NOT NULL DEFAULT 0,
  closed_by uuid,
  closed_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_closings TO authenticated;
GRANT ALL ON public.commission_closings TO service_role;
ALTER TABLE public.commission_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closings_select_auth" ON public.commission_closings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "closings_admin_manage" ON public.commission_closings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_commission_closings_updated_at
  BEFORE UPDATE ON public.commission_closings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Estornos (clawback)
CREATE TABLE IF NOT EXISTS public.commission_clawbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.commission_conversions(id) ON DELETE CASCADE,
  churn_source text NOT NULL DEFAULT 'metas_churn_historico',
  churn_ref text,
  customer_email text,
  canceled_at date NOT NULL,
  months_since_sale integer NOT NULL DEFAULT 0,
  original_amount numeric NOT NULL DEFAULT 0,
  clawback_amount numeric NOT NULL DEFAULT 0,
  sale_month date,
  payment_month date NOT NULL,
  seller_user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  forgiven_by uuid,
  forgiven_at timestamptz,
  forgiven_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversion_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_clawbacks TO authenticated;
GRANT ALL ON public.commission_clawbacks TO service_role;
ALTER TABLE public.commission_clawbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clawbacks_admin_manage" ON public.commission_clawbacks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "clawbacks_seller_select_own" ON public.commission_clawbacks
  FOR SELECT TO authenticated USING (seller_user_id = auth.uid());

CREATE TRIGGER trg_commission_clawbacks_updated_at
  BEFORE UPDATE ON public.commission_clawbacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_clawbacks_payment_month ON public.commission_clawbacks(payment_month);
CREATE INDEX IF NOT EXISTS idx_clawbacks_seller ON public.commission_clawbacks(seller_user_id);

-- 5. Helper: mês de pagamento congelado?
CREATE OR REPLACE FUNCTION public.commission_month_locked(p_month date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commission_closings
    WHERE payment_month = date_trunc('month', p_month)::date
      AND status IN ('closed','paid')
  )
$$;

-- 6. Apuração revisada
CREATE OR REPLACE FUNCTION public.apply_commission_from_stripe(p_stripe_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_seller_src  text;
  v_plan        text;
  v_paytype     commission_payment_type;
  v_row_id      uuid;
  v_overrides   text[];
  v_base_mode   text := 'net';
  v_effective   numeric := 0;
  v_type        text;
  v_eligible    boolean := true;
  v_mult        numeric := 1;
  v_base_kind   text := 'mrr_total';
BEGIN
  SELECT * INTO v_sc FROM public.stripe_conversions WHERE id = p_stripe_id;
  IF NOT FOUND OR v_sc.converted_at IS NULL THEN
    RETURN NULL;
  END IF;

  v_effective := COALESCE(v_sc.mrr_net, v_sc.mrr, 0);
  IF v_effective <= 0 THEN
    UPDATE public.commission_conversions
       SET status = 'ignored', commission_amount = 0, commission_pct = 0, updated_at = now()
     WHERE source = 'stripe' AND stripe_conversion_id = p_stripe_id
       AND COALESCE(manually_reviewed, false) = false
       AND NOT public.commission_month_locked(payment_month);
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings FROM public.commission_settings LIMIT 1;
  IF NOT FOUND THEN
    v_settings.t_plus_months := 2;
    v_settings.payment_day := 10;
    v_settings.commission_base := 'net';
    v_settings.eligible_new := true;
    v_settings.eligible_reactivation := true;
    v_settings.eligible_upsell := true;
    v_settings.eligible_renewal := false;
    v_settings.eligible_downgrade := false;
    v_settings.mult_new := 1;
    v_settings.mult_reactivation := 1;
    v_settings.mult_upsell := 1;
    v_settings.upsell_base := 'delta';
  END IF;
  v_base_mode := COALESCE(v_settings.commission_base, 'net');

  IF v_sc.stripe_price_id IS NOT NULL THEN
    SELECT * INTO v_map FROM public.commission_price_map
      WHERE price_id = v_sc.stripe_price_id LIMIT 1;
  END IF;

  v_sale_month := date_trunc('month', v_sc.converted_at)::date;
  v_pay_month  := (v_sale_month + make_interval(months => COALESCE(v_settings.t_plus_months, 2)))::date;

  -- tipo de conversão (reativação prevalece)
  IF COALESCE(v_sc.is_reactivation, false) THEN
    v_type := 'reactivation';
  ELSE
    v_type := COALESCE(v_sc.conversion_type, 'new');
  END IF;

  -- cascata de vendedor: conversão Stripe > oportunidade > mapa de preços
  v_seller_id := v_sc.assigned_seller_id;
  IF v_seller_id IS NOT NULL THEN
    v_seller_src := 'stripe_conversion';
  END IF;

  IF v_seller_id IS NULL AND v_sc.matched_opportunity_id IS NOT NULL THEN
    SELECT o.consultant_id INTO v_seller_id
      FROM public.opportunities o WHERE o.id = v_sc.matched_opportunity_id;
    IF v_seller_id IS NOT NULL THEN
      v_seller_src := 'opportunity';
    END IF;
  END IF;

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

    IF v_seller_id IS NULL AND v_map.seller_user_id IS NOT NULL THEN
      v_seller_id  := v_map.seller_user_id;
      v_seller_lbl := v_map.seller_label;
      v_seller_src := 'price_map';
    END IF;

    IF COALESCE(v_map.requires_commission, true) = false THEN
      v_pct    := 0;
      v_amount := 0;
      v_status := 'calculated';
    ELSE
      -- elegibilidade e multiplicador por tipo
      IF v_type = 'reactivation' THEN
        v_eligible := COALESCE(v_settings.eligible_reactivation, true);
        v_mult := COALESCE(v_settings.mult_reactivation, 1);
      ELSIF v_type = 'upsell' THEN
        v_eligible := COALESCE(v_settings.eligible_upsell, true);
        v_mult := COALESCE(v_settings.mult_upsell, 1);
        IF COALESCE(v_settings.upsell_base, 'delta') = 'delta' THEN
          v_base_kind := 'mrr_delta';
          v_mrr := GREATEST(COALESCE(v_sc.delta_mrr, v_mrr - COALESCE(v_sc.previous_mrr, 0)), 0);
        END IF;
      ELSIF v_type = 'renewal' THEN
        v_eligible := COALESCE(v_settings.eligible_renewal, false);
        v_mult := 1;
      ELSIF v_type = 'downgrade' THEN
        v_eligible := COALESCE(v_settings.eligible_downgrade, false);
        v_mult := 1;
      ELSE
        v_eligible := COALESCE(v_settings.eligible_new, true);
        v_mult := COALESCE(v_settings.mult_new, 1);
      END IF;

      IF NOT v_eligible THEN
        v_pct    := 0;
        v_amount := 0;
        v_status := 'calculated';
      ELSE
        IF v_sc.coupon_id IS NOT NULL THEN
          SELECT * INTO v_ref FROM public.commission_reference
            WHERE plan_name = v_map.plan_name
              AND payment_type = v_map.payment_type
              AND coupon_id = v_sc.coupon_id
              AND is_active = true
            LIMIT 1;
        END IF;

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
          v_pct := ROUND(v_pct * COALESCE(v_mult, 1), 6);
          v_amount := ROUND(v_mrr * v_pct, 2);
          v_status := 'calculated';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_seller_lbl IS NULL AND v_seller_id IS NOT NULL THEN
    SELECT COALESCE(p.full_name, p.email) INTO v_seller_lbl
      FROM public.profiles p WHERE p.user_id = v_seller_id;
  END IF;

  SELECT * INTO v_existing FROM public.commission_conversions
    WHERE source = 'stripe' AND stripe_conversion_id = p_stripe_id
    LIMIT 1;

  IF v_existing.id IS NULL THEN
    -- mês já fechado: joga o pagamento para o próximo mês aberto
    WHILE public.commission_month_locked(v_pay_month) LOOP
      v_pay_month := (v_pay_month + interval '1 month')::date;
    END LOOP;

    INSERT INTO public.commission_conversions (
      source, stripe_conversion_id, import_id,
      sale_month, payment_month,
      customer_email,
      price_id, offer_name, gateway, mrr,
      resolved_plan, resolved_payment_type,
      resolved_seller_user_id, resolved_seller_label, seller_source,
      conversion_type, base_kind,
      commission_pct, commission_amount, status,
      origem_cliente
    ) VALUES (
      'stripe', p_stripe_id, NULL,
      v_sale_month, v_pay_month,
      v_sc.customer_email,
      v_sc.stripe_price_id, COALESCE(v_map.offer_name, v_sc.product_name),
      'stripe', v_mrr,
      v_plan, v_paytype,
      v_seller_id, v_seller_lbl, v_seller_src,
      v_type, v_base_kind,
      v_pct, v_amount, v_status,
      'stripe'
    )
    RETURNING id INTO v_row_id;
    RETURN v_row_id;
  END IF;

  -- mês fechado: congela a linha
  IF public.commission_month_locked(v_existing.payment_month) THEN
    RETURN v_existing.id;
  END IF;

  v_overrides := COALESCE(v_existing.override_fields, '{}'::text[]);

  UPDATE public.commission_conversions SET
    sale_month              = CASE WHEN v_existing.manually_reviewed AND 'sale_month'              = ANY(v_overrides) THEN sale_month              ELSE v_sale_month END,
    payment_month           = CASE WHEN v_existing.manually_reviewed AND 'payment_month'           = ANY(v_overrides) THEN payment_month           ELSE v_pay_month  END,
    mrr                     = CASE WHEN v_existing.manually_reviewed AND 'mrr'                     = ANY(v_overrides) THEN mrr                     ELSE v_mrr        END,
    resolved_plan           = CASE WHEN v_existing.manually_reviewed AND 'resolved_plan'           = ANY(v_overrides) THEN resolved_plan           ELSE v_plan       END,
    resolved_payment_type   = CASE WHEN v_existing.manually_reviewed AND 'resolved_payment_type'   = ANY(v_overrides) THEN resolved_payment_type   ELSE v_paytype    END,
    resolved_seller_user_id = CASE WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN resolved_seller_user_id ELSE v_seller_id  END,
    resolved_seller_label   = CASE WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN resolved_seller_label   ELSE v_seller_lbl END,
    seller_source           = CASE WHEN v_existing.manually_reviewed AND 'resolved_seller_user_id' = ANY(v_overrides) THEN 'manual'                ELSE v_seller_src END,
    conversion_type         = v_type,
    base_kind               = CASE WHEN v_existing.manually_reviewed AND 'mrr'                     = ANY(v_overrides) THEN base_kind               ELSE v_base_kind  END,
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

-- 7. Geração de estornos a partir da base de churn carregada (metas_churn_historico)
CREATE OR REPLACE FUNCTION public.generate_commission_clawbacks(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_settings public.commission_settings%ROWTYPE;
  v_guarantee int;
  r record;
  v_created int := 0;
  v_would int := 0;
  v_total numeric := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_settings FROM public.commission_settings LIMIT 1;
  v_guarantee := COALESCE(v_settings.guarantee_months, 0);
  IF v_guarantee <= 0 THEN
    RETURN jsonb_build_object('error', 'guarantee_months = 0: estorno desativado');
  END IF;

  FOR r IN
    SELECT DISTINCT ON (cc.id)
      cc.id AS conversion_id,
      cc.customer_email,
      cc.sale_month,
      cc.commission_amount,
      cc.payment_month,
      cc.resolved_seller_user_id,
      ch.id AS churn_id,
      ch.data_cancelamento
    FROM public.commission_conversions cc
    JOIN public.metas_churn_historico ch
      ON lower(trim(ch.email_norm)) = lower(trim(cc.customer_email))
    WHERE cc.customer_email IS NOT NULL
      AND cc.commission_amount > 0
      AND cc.status <> 'ignored'
      AND ch.data_cancelamento IS NOT NULL
      AND ch.data_cancelamento >= cc.sale_month
      AND ch.data_cancelamento < (cc.sale_month + make_interval(months => v_guarantee))::date
      AND (p_from IS NULL OR ch.data_cancelamento >= p_from)
      AND (p_to IS NULL OR ch.data_cancelamento <= p_to)
      AND NOT EXISTS (SELECT 1 FROM public.commission_clawbacks cb WHERE cb.conversion_id = cc.id)
    ORDER BY cc.id, ch.data_cancelamento
  LOOP
    v_would := v_would + 1;
    v_total := v_total + r.commission_amount;
    IF NOT p_dry_run THEN
      INSERT INTO public.commission_clawbacks (
        conversion_id, churn_source, churn_ref, customer_email,
        canceled_at, months_since_sale, original_amount, clawback_amount,
        sale_month, payment_month, seller_user_id, status
      ) VALUES (
        r.conversion_id, 'metas_churn_historico', r.churn_id::text, r.customer_email,
        r.data_cancelamento,
        GREATEST(0, (date_part('year', r.data_cancelamento) - date_part('year', r.sale_month))::int * 12
                    + (date_part('month', r.data_cancelamento) - date_part('month', r.sale_month))::int),
        r.commission_amount, -1 * r.commission_amount,
        r.sale_month,
        CASE WHEN public.commission_month_locked(r.payment_month)
             THEN (date_trunc('month', GREATEST(r.data_cancelamento, r.payment_month)) + interval '1 month')::date
             ELSE r.payment_month END,
        r.resolved_seller_user_id, 'pending'
      )
      ON CONFLICT (conversion_id) DO NOTHING;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'guarantee_months', v_guarantee,
    'matches', v_would,
    'created', v_created,
    'total_amount', v_total,
    'dry_run', p_dry_run
  );
END;
$function$;

-- 8. Reprocessamento em lote (respeita fechamento)
CREATE OR REPLACE FUNCTION public.apply_commissions_from_stripe_range(
  p_from timestamp with time zone DEFAULT (now() - '90 days'::interval),
  p_to timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
  v_total int := 0;
  v_pending int := 0;
  v_no_seller int := 0;
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

  SELECT count(*) INTO v_no_seller
    FROM public.commission_conversions
   WHERE resolved_seller_user_id IS NULL AND status <> 'ignored';

  RETURN jsonb_build_object(
    'processed', v_total,
    'pending_mapping', v_pending,
    'without_seller', v_no_seller,
    'from', p_from,
    'to', p_to
  );
END;
$function$;