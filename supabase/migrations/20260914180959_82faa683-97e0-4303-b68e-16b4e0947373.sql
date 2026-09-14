CREATE TABLE public.tactical_campaign_manual_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_norm text NOT NULL,
  activation_date date NOT NULL,
  coupon_id text,
  is_campaign boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_norm, activation_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_campaign_manual_links TO authenticated;
GRANT ALL ON public.tactical_campaign_manual_links TO service_role;

ALTER TABLE public.tactical_campaign_manual_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tatico ou admin veem marcacoes manuais de campanha"
ON public.tactical_campaign_manual_links FOR SELECT TO authenticated
USING (public.is_tatico_or_admin(auth.uid()));

CREATE POLICY "Tatico ou admin gerenciam marcacoes manuais de campanha"
ON public.tactical_campaign_manual_links FOR ALL TO authenticated
USING (public.is_tatico_or_admin(auth.uid()))
WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_tactical_campaign_manual_links_updated_at
BEFORE UPDATE ON public.tactical_campaign_manual_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tactical_weekly_mrr_actual(
  p_from date,
  p_to date,
  p_as_of date
)
RETURNS TABLE(
  activation_date date,
  classification text,
  origin text,
  is_campaign boolean,
  customers bigint,
  mrr numeric,
  snapshot_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH snapshot AS (
    SELECT max(data_snapshot) AS snapshot_date
    FROM public.metas_ativos_pagantes_daily
    WHERE data_snapshot <= p_as_of
  ), dedup AS (
    SELECT DISTINCT ON (
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email))),
      coalesce(d.stripe_price_id, ''),
      lower(trim(d.classificacao_company))
    )
      d.company_id,
      lower(trim(d.email)) AS email_norm,
      d.stripe_price_id,
      d.data_inicio AS activation_date,
      lower(trim(d.classificacao_company)) AS classification,
      lower(coalesce(nullif(trim(d.origem_cliente), ''), 'sem origem')) AS origin,
      coalesce(d.mrr, 0)::numeric AS current_mrr,
      coalesce(d.previous_mrr, 0)::numeric AS previous_mrr,
      s.snapshot_date
    FROM snapshot s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.data_snapshot = s.snapshot_date
    WHERE lower(coalesce(d.status_assinatura, '')) = 'ativo'
      AND d.data_inicio BETWEEN p_from AND least(p_to, p_as_of)
      AND lower(trim(coalesce(d.classificacao_company, ''))) IN
        ('novo pagante', 'recuperado', 'upsell', 'downsell')
    ORDER BY
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email))),
      coalesce(d.stripe_price_id, ''),
      lower(trim(d.classificacao_company)),
      d.coletado_em DESC NULLS LAST,
      d.id DESC
  ), classified AS (
    SELECT
      d.*,
      coalesce(
        (
          SELECT m.is_campaign
          FROM public.tactical_campaign_manual_links m
          WHERE m.email_norm = d.email_norm
            AND m.activation_date = d.activation_date
          LIMIT 1
        ),
        EXISTS (
          SELECT 1
          FROM public.stripe_conversions sc
          JOIN public.tactical_campaign_coupons tc
            ON tc.coupon_id = sc.coupon_id
           AND tc.is_campaign = true
          WHERE lower(trim(sc.customer_email)) = d.email_norm
            AND (sc.converted_at AT TIME ZONE 'America/Sao_Paulo')::date
                BETWEEN d.activation_date - 3 AND d.activation_date + 3
            AND CASE d.classification
              WHEN 'recuperado' THEN
                coalesce(sc.is_reactivation, false)
                OR lower(coalesce(sc.conversion_type, '')) LIKE '%reactiv%'
              WHEN 'upsell' THEN
                lower(coalesce(sc.conversion_type, '')) IN ('upsell', 'upgrade')
              WHEN 'downsell' THEN
                lower(coalesce(sc.conversion_type, '')) IN ('downsell', 'downgrade')
              ELSE
                NOT coalesce(sc.is_reactivation, false)
                AND lower(coalesce(sc.conversion_type, '')) NOT IN
                  ('upsell', 'upgrade', 'downsell', 'downgrade', 'renewal')
            END
        )
      ) AS is_campaign,
      CASE d.classification
        WHEN 'upsell' THEN greatest(d.current_mrr - d.previous_mrr, 0)
        WHEN 'downsell' THEN greatest(d.previous_mrr - d.current_mrr, 0)
        ELSE greatest(d.current_mrr, 0)
      END AS movement_mrr
    FROM dedup d
  )
  SELECT
    activation_date,
    classification,
    origin,
    is_campaign,
    count(*)::bigint AS customers,
    sum(movement_mrr)::numeric AS mrr,
    max(snapshot_date)::date AS snapshot_date
  FROM classified
  WHERE movement_mrr > 0
  GROUP BY activation_date, classification, origin, is_campaign
  ORDER BY activation_date, classification, origin, is_campaign;
$function$;

REVOKE ALL ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tactical_weekly_mrr_actual(date, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.tactical_campaign_match_gaps(
  p_from date,
  p_to date
)
RETURNS TABLE(
  gap_type text,
  email text,
  activation_date date,
  converted_at timestamptz,
  coupon_id text,
  coupon_name text,
  classification text,
  mrr numeric,
  manual_is_campaign boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH snapshot AS (
    SELECT max(data_snapshot) AS snapshot_date
    FROM public.metas_ativos_pagantes_daily
  ), base AS (
    SELECT DISTINCT
      lower(trim(d.email)) AS email_norm,
      d.data_inicio AS activation_date,
      lower(trim(d.classificacao_company)) AS classification,
      coalesce(d.mrr, 0)::numeric AS mrr
    FROM snapshot s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.data_snapshot = s.snapshot_date
    WHERE lower(coalesce(d.status_assinatura, '')) = 'ativo'
      AND d.data_inicio BETWEEN p_from AND p_to
      AND lower(trim(coalesce(d.classificacao_company, ''))) IN
        ('novo pagante', 'recuperado', 'upsell', 'downsell')
  ), conv AS (
    SELECT
      lower(trim(sc.customer_email)) AS email_norm,
      sc.converted_at,
      sc.coupon_id,
      sc.coupon_name,
      coalesce(sc.mrr_net, sc.mrr, 0)::numeric AS mrr
    FROM public.stripe_conversions sc
    JOIN public.tactical_campaign_coupons tc
      ON tc.coupon_id = sc.coupon_id AND tc.is_campaign = true
    WHERE (sc.converted_at AT TIME ZONE 'America/Sao_Paulo')::date
            BETWEEN p_from - 3 AND p_to + 3
      AND lower(coalesce(sc.conversion_type, '')) <> 'renewal'
  )
  SELECT
    'cupom_sem_base'::text AS gap_type,
    c.email_norm AS email,
    NULL::date AS activation_date,
    c.converted_at,
    c.coupon_id,
    c.coupon_name,
    NULL::text AS classification,
    c.mrr,
    m.is_campaign AS manual_is_campaign
  FROM conv c
  LEFT JOIN base b ON b.email_norm = c.email_norm
  LEFT JOIN public.tactical_campaign_manual_links m
    ON m.email_norm = c.email_norm
  WHERE b.email_norm IS NULL

  UNION ALL

  SELECT
    'base_sem_cobranca'::text AS gap_type,
    b.email_norm AS email,
    b.activation_date,
    NULL::timestamptz AS converted_at,
    NULL::text AS coupon_id,
    NULL::text AS coupon_name,
    b.classification,
    b.mrr,
    m.is_campaign AS manual_is_campaign
  FROM base b
  LEFT JOIN public.stripe_conversions sc
    ON lower(trim(sc.customer_email)) = b.email_norm
   AND (sc.converted_at AT TIME ZONE 'America/Sao_Paulo')::date
       BETWEEN b.activation_date - 3 AND b.activation_date + 3
  LEFT JOIN public.tactical_campaign_manual_links m
    ON m.email_norm = b.email_norm AND m.activation_date = b.activation_date
  WHERE sc.id IS NULL
  ORDER BY 1, 2;
$function$;

REVOKE ALL ON FUNCTION public.tactical_campaign_match_gaps(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tactical_campaign_match_gaps(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.tactical_campaign_match_gaps(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tactical_campaign_match_gaps(date, date) TO service_role;