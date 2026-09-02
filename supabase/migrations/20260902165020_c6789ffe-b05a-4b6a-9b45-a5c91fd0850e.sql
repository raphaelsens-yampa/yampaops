DROP FUNCTION IF EXISTS public.origin_monthly_realized(date, date, date);

CREATE FUNCTION public.origin_monthly_realized(p_from date, p_to date, p_as_of date)
RETURNS TABLE(year_month date, kind text, origem text, status text, classificacao text, qtd bigint, mrr numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH months AS (
    SELECT to_date('01/' || mes_ref, 'DD/MM/YYYY') AS ym,
           mes_ref,
           max(data_snapshot) AS snap
    FROM public.metas_ativos_pagantes_daily
    WHERE data_snapshot <= p_as_of
    GROUP BY 1, 2
  ), seq AS (
    SELECT ym, mes_ref, snap, lag(snap) OVER (ORDER BY ym) AS prev_snap
    FROM months
  ), sel AS (
    SELECT * FROM seq
    WHERE ym >= date_trunc('month', p_from)::date
      AND ym <= date_trunc('month', p_to)::date
  ), r AS (
    SELECT DISTINCT ON (s.ym, d.company_id)
      s.ym,
      s.prev_snap,
      d.company_id,
      lower(coalesce(d.origem_cliente, 'sem_origem')) AS origem,
      lower(coalesce(d.status_assinatura, 'sem_status')) AS status,
      lower(coalesce(d.classificacao_company, 'sem_classificacao')) AS classificacao,
      coalesce(d.mrr, 0) AS mrr
    FROM sel s
    JOIN public.metas_ativos_pagantes_daily d
      ON d.mes_ref = s.mes_ref AND d.data_snapshot = s.snap
    ORDER BY s.ym, d.company_id, d.tipo_snapshot NULLS LAST, d.id
  ), stock AS (
    -- Estoque: Total de MRR, Ativos e Churn seguem a foto do mês
    SELECT ym AS year_month, 'stock'::text AS kind, origem, status, classificacao,
           count(*)::bigint AS qtd, sum(mrr)::numeric AS mrr
    FROM r
    GROUP BY 1, 2, 3, 4, 5
  ), flow AS (
    -- Entradas: só contam os clientes que passaram a ter essa classificação
    -- em relação ao snapshot do mês anterior. O snapshot corrente herda as
    -- marcações do mês passado, então a contagem direta inflava o mês.
    SELECT r.ym AS year_month, 'flow'::text AS kind, r.origem, r.status, r.classificacao,
           count(*)::bigint AS qtd, sum(r.mrr)::numeric AS mrr
    FROM r
    WHERE r.status = 'ativo'
      AND r.classificacao IN ('novo pagante', 'recuperado', 'upsell', 'downsell')
      AND NOT EXISTS (
        SELECT 1
        FROM public.metas_ativos_pagantes_daily p
        WHERE r.prev_snap IS NOT NULL
          AND p.data_snapshot = r.prev_snap
          AND p.company_id = r.company_id
          AND p.status_assinatura = 'ativo'
          AND lower(coalesce(p.classificacao_company, 'sem_classificacao')) = r.classificacao
      )
    GROUP BY 1, 2, 3, 4, 5
  )
  SELECT * FROM stock
  UNION ALL
  SELECT * FROM flow
$function$;

GRANT EXECUTE ON FUNCTION public.origin_monthly_realized(date, date, date) TO anon, authenticated, service_role;