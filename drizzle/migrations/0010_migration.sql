CREATE OR REPLACE FUNCTION public.origin_daily_shares(p_from date, p_to date)
RETURNS TABLE(data date, classificacao text, origem_cliente text, qtd_mtd bigint, mrr_mtd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH months AS (
    SELECT mes_ref, max(data_snapshot) AS snap
    FROM public.metas_ativos_pagantes_daily
    WHERE data_snapshot <= p_to
    GROUP BY mes_ref
  ), r AS (
    SELECT DISTINCT ON (d.company_id, d.data_inicio)
      d.data_inicio,
      CASE lower(d.classificacao_company)
        WHEN 'novo pagante' THEN 'novos_pagantes'
        WHEN 'recuperado' THEN 'recuperados'
        WHEN 'upsell' THEN 'upsell'
        WHEN 'downsell' THEN 'downsell'
      END AS cls,
      lower(coalesce(d.origem_cliente, 'sem_origem')) AS origem,
      coalesce(d.mrr, 0) AS mrr
    FROM months m
    JOIN public.metas_ativos_pagantes_daily d
      ON d.mes_ref = m.mes_ref AND d.data_snapshot = m.snap
    WHERE d.status_assinatura = 'ativo'
      AND lower(d.classificacao_company) IN ('novo pagante','recuperado','upsell','downsell')
      AND d.data_inicio BETWEEN p_from AND p_to
      AND to_char(d.data_inicio, 'MM/YYYY') = m.mes_ref
    ORDER BY d.company_id, d.data_inicio, d.data_snapshot DESC, d.id
  )
  SELECT data_inicio, cls, origem, count(*)::bigint, sum(mrr)::numeric
  FROM r GROUP BY 1, 2, 3;
$$;
GRANT EXECUTE ON FUNCTION public.origin_daily_shares(date, date) TO authenticated;