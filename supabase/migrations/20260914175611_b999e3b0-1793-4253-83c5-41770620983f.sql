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
SECURITY DEFINER
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
      EXISTS (
        SELECT 1
        FROM public.stripe_conversions sc
        JOIN public.tactical_campaign_coupons tc
          ON tc.coupon_id = sc.coupon_id
         AND tc.is_campaign = true
        WHERE lower(trim(sc.customer_email)) = d.email_norm
          AND (sc.converted_at AT TIME ZONE 'America/Sao_Paulo')::date = d.activation_date
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