DROP FUNCTION IF EXISTS public.origin_monthly_realized(date, date, date);

CREATE FUNCTION public.origin_monthly_realized(p_from date, p_to date, p_as_of date)
RETURNS TABLE(year_month date, kind text, origem text, status text, classificacao text, qtd bigint, mrr numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ), r AS (
    SELECT DISTINCT ON (s.ym, d.company_id)
      s.ym,
      lower(coalesce(d.origem_cliente, 'sem_origem')) AS origem,
      lower(coalesce(d.status_assinatura, 'sem_status')) AS status,
      lower(coalesce(d.classificacao_company, 'sem_classificacao')) AS classificacao,
      coalesce(d.mrr, 0) AS mrr,
      date_trunc('month', coalesce(d.data_inicio, s.ym))::date AS flow_ym
    FROM sel s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.mes_ref = s.mes_ref AND d.data_snapshot = s.snap
    ORDER BY s.ym, d.company_id, d.tipo_snapshot NULLS LAST, d.id
  ), stock AS (
    -- Estoque (Total de MRR, Ativos, Churn) segue o mês do snapshot
    SELECT ym AS year_month, 'stock'::text AS kind, origem, status, classificacao,
           count(*)::bigint AS qtd, sum(mrr)::numeric AS mrr
    FROM r
    GROUP BY 1, 2, 3, 4, 5
  ), flow AS (
    -- Entradas (New MRR, Recuperado, Upsell, Downsell) contam no mês do evento.
    -- O snapshot carrega a classificação do mês anterior, por isso usamos data_inicio.
    SELECT flow_ym AS year_month, 'flow'::text AS kind, origem, status, classificacao,
           count(*)::bigint AS qtd, sum(mrr)::numeric AS mrr
    FROM r
    WHERE status = 'ativo'
      AND classificacao IN ('novo pagante', 'recuperado', 'upsell', 'downsell')
      AND flow_ym = ym
    GROUP BY 1, 2, 3, 4, 5
  )
  SELECT * FROM stock
  UNION ALL
  SELECT * FROM flow
$function$;

GRANT EXECUTE ON FUNCTION public.origin_monthly_realized(date, date, date) TO anon, authenticated, service_role;