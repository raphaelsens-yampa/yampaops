CREATE OR REPLACE FUNCTION public.metabase_campaign_entries_monthly(
  p_year integer,
  p_as_of date
)
RETURNS TABLE(
  year_month date,
  customers bigint,
  mrr numeric,
  snapshot_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH months AS (
    SELECT gs::date AS month_start,
           (gs + interval '1 month - 1 day')::date AS month_end
    FROM generate_series(
      make_date(p_year, 1, 1),
      make_date(p_year, 12, 1),
      interval '1 month'
    ) gs
    WHERE gs::date <= date_trunc('month', p_as_of)::date
  ), snap_list AS (
    SELECT DISTINCT data_snapshot
    FROM public.metas_ativos_pagantes_daily
    WHERE data_snapshot <= p_as_of
  ), snaps AS (
    SELECT m.month_start,
           m.month_end,
           (SELECT max(s.data_snapshot) FROM snap_list s
             WHERE s.data_snapshot <= least(m.month_end, p_as_of)) AS snapshot_date
    FROM months m
  ), dedup AS (
    SELECT DISTINCT ON (
      s.month_start,
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email)))
    )
      s.month_start,
      s.snapshot_date,
      lower(trim(d.email)) AS email_norm,
      d.data_inicio AS activation_date,
      coalesce(d.mrr, 0)::numeric AS current_mrr
    FROM snaps s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.data_snapshot = s.snapshot_date
     AND d.data_inicio BETWEEN s.month_start AND least(s.month_end, p_as_of)
    WHERE s.snapshot_date IS NOT NULL
      AND lower(coalesce(d.status_assinatura, '')) = 'ativo'
      AND lower(trim(coalesce(d.classificacao_company, ''))) IN ('novo pagante', 'recuperado')
    ORDER BY
      s.month_start,
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email))),
      d.coletado_em DESC NULLS LAST,
      d.id DESC
  ), camp AS (
    SELECT DISTINCT
      lower(trim(sc.customer_email)) AS email_norm,
      (sc.converted_at AT TIME ZONE 'America/Sao_Paulo')::date AS conv_date
    FROM public.stripe_conversions sc
    JOIN public.tactical_campaign_coupons tc
      ON tc.coupon_id = sc.coupon_id
     AND tc.is_campaign = true
    WHERE sc.converted_at IS NOT NULL
      AND lower(coalesce(sc.conversion_type, '')) <> 'renewal'
  ), flagged AS (
    SELECT
      d.month_start,
      d.snapshot_date,
      d.current_mrr,
      coalesce(
        m.is_campaign,
        EXISTS (
          SELECT 1 FROM camp c
          WHERE c.email_norm = d.email_norm
            AND c.conv_date BETWEEN d.activation_date - 3 AND d.activation_date + 3
        )
      ) AS is_campaign
    FROM dedup d
    LEFT JOIN public.tactical_campaign_manual_links m
      ON m.email_norm = d.email_norm
     AND m.activation_date = d.activation_date
  )
  SELECT
    month_start AS year_month,
    count(*)::bigint AS customers,
    sum(current_mrr)::numeric AS mrr,
    max(snapshot_date)::date AS snapshot_date
  FROM flagged
  WHERE is_campaign
    AND current_mrr > 0
  GROUP BY month_start
  ORDER BY month_start;
$function$;