CREATE OR REPLACE FUNCTION public.campaign_cohort_refresh(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot date;
  v_count int := 0;
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT MAX(data_snapshot) INTO v_snapshot FROM public.metas_ativos_pagantes_daily;

  DELETE FROM public.campaign_cohort_results WHERE campaign_id = p_campaign_id;

  WITH contacts AS (
    SELECT id, campaign_id, email_norm
    FROM public.campaign_cohort_contacts
    WHERE campaign_id = p_campaign_id
  ),
  mb AS (
    SELECT DISTINCT ON (lower(a.email))
      lower(a.email) AS email_norm,
      a.status_assinatura, a.mrr, a.plano, a.nome_oferta,
      a.origem_cliente, a.data_inicio, a.data_cancelamento, a.tipo_churn
    FROM public.metas_ativos_pagantes_daily a
    WHERE v_snapshot IS NOT NULL
      AND a.data_snapshot = v_snapshot
      AND a.email IS NOT NULL AND a.email <> ''
    ORDER BY lower(a.email),
      CASE lower(coalesce(a.status_assinatura,'')) WHEN 'ativo' THEN 0 WHEN 'trial' THEN 1 ELSE 2 END,
      a.mrr DESC NULLS LAST
  ),
  hist AS (
    SELECT DISTINCT ON (h.email_norm)
      h.email_norm, h.data_cancelamento, h.tipo_churn, h.motivo, h.mrr,
      h.plano, h.nome_oferta, h.data_inicio, h.fonte
    FROM public.metas_churn_historico h
    ORDER BY h.email_norm, h.data_cancelamento DESC
  ),
  sc AS (
    SELECT DISTINCT ON (lower(s.customer_email))
      lower(s.customer_email) AS email_norm,
      COALESCE(s.mrr_net, s.mrr, 0) AS mrr,
      s.plan_name, s.product_name,
      COALESCE(s.converted_at, s.registered_at, s.created_at)::date AS started_at
    FROM public.stripe_conversions s
    WHERE s.customer_email IS NOT NULL AND s.customer_email <> ''
    ORDER BY lower(s.customer_email), COALESCE(s.converted_at, s.registered_at, s.created_at) DESC
  ),
  churn AS (
    SELECT DISTINCT ON (lower(e.customer_email))
      lower(e.customer_email) AS email_norm,
      e.canceled_at::date AS canceled_at,
      e.cancellation_reason
    FROM public.stripe_churn_events e
    WHERE e.customer_email IS NOT NULL AND e.customer_email <> ''
    ORDER BY lower(e.customer_email), e.canceled_at DESC
  ),
  joined AS (
    SELECT
      c.campaign_id, c.id AS contact_id, c.email_norm,
      m.email_norm AS m_email,
      m.status_assinatura, m.mrr, m.plano, m.nome_oferta,
      m.origem_cliente, m.data_inicio, m.data_cancelamento, m.tipo_churn,
      h.data_cancelamento AS h_cancel, h.tipo_churn AS h_tipo, h.motivo AS h_motivo,
      h.mrr AS h_mrr, h.plano AS h_plano, h.nome_oferta AS h_oferta,
      h.data_inicio AS h_inicio, h.fonte AS h_fonte,
      h.email_norm AS h_email,
      s.email_norm AS s_email, s.mrr AS s_mrr, s.plan_name AS s_plan,
      s.product_name AS s_product, s.started_at AS s_started,
      ch.canceled_at AS ch_cancel, ch.cancellation_reason AS ch_reason,
      (m.email_norm IS NOT NULL
        AND lower(coalesce(m.status_assinatura,'')) IN ('ativo','trial')) AS is_current_active
    FROM contacts c
    LEFT JOIN mb m ON m.email_norm = c.email_norm
    LEFT JOIN hist h ON h.email_norm = c.email_norm
    LEFT JOIN sc s ON s.email_norm = c.email_norm
    LEFT JOIN churn ch ON ch.email_norm = c.email_norm
  ),
  ins AS (
    INSERT INTO public.campaign_cohort_results (
      campaign_id, contact_id, email_norm, status, mrr, plan_name, offer_name,
      origem_cliente, started_at, canceled_at, churn_type, source, churn_source,
      snapshot_date, computed_at
    )
    SELECT
      j.campaign_id, j.contact_id, j.email_norm,
      CASE
        WHEN j.is_current_active AND lower(coalesce(j.status_assinatura,'')) = 'ativo' THEN 'active'
        WHEN j.is_current_active THEN 'trial'
        WHEN j.m_email IS NOT NULL AND j.status_assinatura IS NOT NULL
             AND lower(j.status_assinatura) = 'cancelado' THEN 'canceled'
        WHEN j.h_email IS NOT NULL THEN 'canceled'
        WHEN j.ch_cancel IS NOT NULL THEN 'canceled'
        WHEN j.status_assinatura IS NOT NULL THEN 'unknown'
        WHEN j.s_email IS NOT NULL THEN 'active'
        ELSE 'never'
      END,
      CASE
        WHEN j.status_assinatura IS NOT NULL THEN COALESCE(j.mrr, 0)
        WHEN j.h_email IS NOT NULL THEN COALESCE(j.h_mrr, 0)
        WHEN j.s_email IS NOT NULL AND j.ch_cancel IS NULL THEN COALESCE(j.s_mrr, 0)
        ELSE 0
      END,
      COALESCE(j.plano, j.h_plano, j.s_plan),
      COALESCE(j.nome_oferta, j.h_oferta, j.s_product),
      j.origem_cliente,
      COALESCE(j.data_inicio, j.h_inicio, j.s_started),
      CASE WHEN j.is_current_active THEN NULL
           ELSE COALESCE(j.data_cancelamento, j.h_cancel, j.ch_cancel) END,
      CASE WHEN j.is_current_active THEN NULL
           ELSE COALESCE(j.tipo_churn, j.h_tipo, j.h_motivo, j.ch_reason) END,
      CASE WHEN j.status_assinatura IS NOT NULL THEN 'metabase'
           WHEN j.h_email IS NOT NULL THEN 'metabase'
           WHEN j.s_email IS NOT NULL THEN 'stripe'
           ELSE NULL END,
      CASE WHEN j.is_current_active THEN NULL
           WHEN j.data_cancelamento IS NOT NULL THEN 'snapshot'
           WHEN j.h_cancel IS NOT NULL THEN COALESCE(j.h_fonte, 'metabase')
           WHEN j.ch_cancel IS NOT NULL THEN 'stripe'
           ELSE NULL END,
      CASE WHEN j.status_assinatura IS NOT NULL THEN v_snapshot ELSE NULL END,
      now()
    FROM joined j
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'computed', v_count,
    'snapshot_date', v_snapshot,
    'computed_at', now()
  );
END;
$function$;