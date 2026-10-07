CREATE OR REPLACE FUNCTION public.churn_analysis_cases(p_from date, p_to date)
RETURNS TABLE (
  id uuid, company_id bigint, email text, phone text, tipo text, motivo text, descricao text,
  plano text, segmento text, origem_cliente text, mrr numeric, data_ref date, data_pedido date,
  final_vigencia date, future_churn_at date, dias_atraso int, inicio_vigencia date,
  desfecho text, mrr_atual numeric, cs_user_id uuid, cs_name text, industry text,
  engagement_band text, tenure_days int, recuperado_em date, recovery_channel text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH snap AS (SELECT max(data_snapshot) d FROM metas_ativos_pagantes_daily),
  cur AS (
    SELECT a.company_id::text cid, bool_or(a.status_assinatura = 'ativo') ativo,
           sum(CASE WHEN a.status_assinatura='ativo' THEN a.mrr ELSE 0 END) mrr
    FROM metas_ativos_pagantes_daily a, snap WHERE a.data_snapshot = snap.d GROUP BY 1
  ),
  port AS (
    SELECT DISTINCT ON (lower(email)) lower(email) em, cs_user_id, industry, engagement_band, tenure_days
    FROM cs_portfolio ORDER BY lower(email), is_active DESC, updated_at DESC
  )
  SELECT p.id, p.company_id, p.email_norm, p.phone, p.tipo, p.motivo, p.descricao, p.plano, p.segmento,
    p.origem_cliente, p.mrr, p.data_ref, p.data_pedido, p.final_vigencia, p.future_churn_at, p.dias_atraso,
    p.inicio_vigencia,
    CASE WHEN coalesce(p.future_churn_at, p.data_ref + 14) >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
              AND coalesce(c.ativo, false) THEN 'em_risco'
         WHEN coalesce(c.ativo, false) THEN 'revertido'
         ELSE 'churn' END,
    c.mrr, port.cs_user_id, pr.full_name, port.industry, port.engagement_band, port.tenure_days,
    r.recovered_at, r.recovery_channel
  FROM metas_pre_churn p
  LEFT JOIN cur c ON c.cid = p.company_id::text
  LEFT JOIN port ON port.em = p.email_norm
  LEFT JOIN profiles pr ON pr.id = port.cs_user_id
  LEFT JOIN LATERAL (
    SELECT t.recovered_at, t.recovery_channel FROM tactical_recoveries t
    WHERE lower(t.customer_email) = p.email_norm AND t.recovered_at >= p.data_ref - 31
    ORDER BY t.recovered_at LIMIT 1
  ) r ON true
  WHERE p.data_ref BETWEEN p_from AND p_to AND auth.uid() IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.churn_analysis_cases(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.churn_analysis_cases(date, date) TO authenticated;