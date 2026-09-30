CREATE OR REPLACE FUNCTION public.tactical_customer_upsell_actual(
  p_from date,
  p_to date,
  p_as_of date
)
RETURNS TABLE(
  activation_date date,
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
  ), latest_rows AS (
    SELECT DISTINCT ON (
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email))),
      coalesce(d.stripe_price_id, ''),
      coalesce(d.data_inicio, date '1900-01-01')
    )
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email))) AS customer_key,
      d.data_inicio,
      lower(trim(coalesce(d.classificacao_company, ''))) AS classification,
      coalesce(d.mrr, 0)::numeric AS current_mrr,
      coalesce(d.previous_mrr, 0)::numeric AS previous_mrr,
      s.snapshot_date
    FROM snapshot s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.data_snapshot = s.snapshot_date
    WHERE lower(coalesce(d.status_assinatura, '')) = 'ativo'
    ORDER BY
      coalesce(nullif(trim(d.company_id), ''), lower(trim(d.email))),
      coalesce(d.stripe_price_id, ''),
      coalesce(d.data_inicio, date '1900-01-01'),
      d.coletado_em DESC NULLS LAST,
      d.id DESC
  ), events AS (
    SELECT customer_key, min(data_inicio)::date AS activation_date
    FROM latest_rows
    WHERE classification = 'upsell'
      AND data_inicio BETWEEN p_from AND least(p_to, p_as_of)
    GROUP BY customer_key
  ), customer_totals AS (
    SELECT
      e.customer_key,
      e.activation_date,
      sum(r.current_mrr)::numeric AS current_mrr,
      sum(r.previous_mrr)::numeric AS previous_mrr,
      max(r.snapshot_date)::date AS snapshot_date
    FROM events e
    JOIN latest_rows r ON r.customer_key = e.customer_key
    GROUP BY e.customer_key, e.activation_date
  ), increases AS (
    SELECT
      activation_date,
      greatest(current_mrr - previous_mrr, 0)::numeric AS increase_mrr,
      snapshot_date
    FROM customer_totals
  )
  SELECT
    activation_date,
    count(*)::bigint AS customers,
    sum(increase_mrr)::numeric AS mrr,
    max(snapshot_date)::date AS snapshot_date
  FROM increases
  WHERE increase_mrr > 0
  GROUP BY activation_date
  ORDER BY activation_date;
$function$;

REVOKE ALL ON FUNCTION public.tactical_customer_upsell_actual(date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tactical_customer_upsell_actual(date, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.tactical_customer_upsell_actual(date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tactical_customer_upsell_actual(date, date, date) TO service_role;