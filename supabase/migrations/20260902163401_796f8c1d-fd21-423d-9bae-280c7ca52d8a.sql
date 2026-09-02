CREATE OR REPLACE FUNCTION public.origin_monthly_realized(p_from date, p_to date, p_as_of date)
RETURNS TABLE(
  year_month date,
  origem text,
  classificacao text,
  qtd bigint,
  mrr numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH months AS (
    SELECT mes_ref,
           to_date('01/' || mes_ref, 'DD/MM/YYYY') AS ym,
           max(data_snapshot) AS snap
    FROM public.metas_ativos_pagantes_daily
    WHERE data_snapshot <= p_as_of
    GROUP BY 1, 2
  ), sel AS (
    SELECT m.ym, m.mes_ref, m.snap
    FROM months m
    WHERE m.ym >= date_trunc('month', p_from)::date
      AND m.ym <= date_trunc('month', p_to)::date
  ), rows AS (
    SELECT DISTINCT ON (s.ym, d.company_id)
      s.ym,
      lower(coalesce(d.origem_cliente, 'sem_origem')) AS origem,
      lower(coalesce(d.classificacao_company, 'sem_classificacao')) AS classificacao,
      coalesce(d.mrr, 0) AS mrr
    FROM sel s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.mes_ref = s.mes_ref AND d.data_snapshot = s.snap
    ORDER BY s.ym, d.company_id, d.tipo_snapshot NULLS LAST, d.id
  )
  SELECT ym AS year_month, origem, classificacao, count(*)::bigint AS qtd, sum(mrr)::numeric AS mrr
  FROM rows
  GROUP BY 1, 2, 3
$$;

REVOKE ALL ON FUNCTION public.origin_monthly_realized(date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.origin_monthly_realized(date, date, date) TO authenticated, service_role;