CREATE OR REPLACE FUNCTION public.cs_portfolio_refresh()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.cs_engagement_config;
  v_inserted integer := 0; v_deactivated integer := 0; v_assigned integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO v_cfg FROM public.cs_engagement_config ORDER BY created_at LIMIT 1;

  CREATE TEMP TABLE tmp_base ON COMMIT DROP AS SELECT * FROM public.cs_snapshot_base();

  INSERT INTO public.cs_portfolio (email, plano, nome_oferta, stripe_price_id, mrr, previous_mrr,
      origem_cliente, recorrencia_pagamento, data_inicio, tenure_days, is_active, last_snapshot)
  SELECT b.email, b.plano, b.nome_oferta, b.stripe_price_id, b.mrr, b.previous_mrr,
      b.origem_cliente, b.recorrencia_pagamento, b.data_inicio, b.tenure_days, true, b.snapshot
  FROM tmp_base b
  ON CONFLICT (email) DO UPDATE SET
      plano = EXCLUDED.plano, nome_oferta = EXCLUDED.nome_oferta,
      stripe_price_id = EXCLUDED.stripe_price_id, mrr = EXCLUDED.mrr,
      previous_mrr = EXCLUDED.previous_mrr, origem_cliente = EXCLUDED.origem_cliente,
      recorrencia_pagamento = EXCLUDED.recorrencia_pagamento, data_inicio = EXCLUDED.data_inicio,
      tenure_days = EXCLUDED.tenure_days, is_active = true, last_snapshot = EXCLUDED.last_snapshot;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.cs_portfolio p SET is_active = false
   WHERE p.is_active AND NOT EXISTS (SELECT 1 FROM tmp_base b WHERE b.email = p.email);
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  UPDATE public.cs_portfolio p
     SET industry = e.industry
    FROM public.cs_client_enrichment e
   WHERE lower(trim(e.email)) = p.email AND coalesce(p.industry,'') <> coalesce(e.industry,'');

  WITH conv AS (
    SELECT lower(trim(c.contact_email)) email,
           count(*) FILTER (WHERE c.created_at >= now() - interval '90 days') conv90,
           max(c.first_contact_message_at) last_client_msg
      FROM public.chatwoot_conversations c
     WHERE c.contact_email IS NOT NULL
     GROUP BY 1
  ), risk AS (
    SELECT lower(trim(cv.contact_email)) email, avg(a.churn_risk_score) risk
      FROM public.chatwoot_conversation_audits a
      JOIN public.chatwoot_conversations cv ON cv.chatwoot_conversation_id = a.conversation_id
     WHERE a.analyzed_at >= now() - interval '180 days' AND cv.contact_email IS NOT NULL
     GROUP BY 1
  ), csat AS (
    SELECT lower(trim(contact_email)) email, avg(rating) rating
      FROM public.chatwoot_csat_responses
     WHERE contact_email IS NOT NULL AND responded_at >= now() - interval '365 days'
     GROUP BY 1
  ), sig AS (
    SELECT p.id,
           coalesce(conv.conv90, 0)::integer conv90,
           conv.last_client_msg,
           risk.risk,
           LEAST(100, GREATEST(0, round(
               v_cfg.weight_conversations * LEAST(coalesce(conv.conv90,0)::numeric / 6, 1)
             + v_cfg.weight_recency * CASE
                 WHEN conv.last_client_msg IS NULL THEN 0
                 WHEN conv.last_client_msg >= now() - interval '30 days' THEN 1
                 WHEN conv.last_client_msg >= now() - interval '90 days' THEN 0.6
                 WHEN conv.last_client_msg >= now() - interval '180 days' THEN 0.3
                 ELSE 0 END
             + v_cfg.weight_csat * CASE WHEN csat.rating IS NULL THEN 0.5 ELSE LEAST(csat.rating/5,1) END
             + v_cfg.weight_churn_risk * CASE WHEN risk.risk IS NULL THEN 0.5 ELSE GREATEST(0, 1 - LEAST(risk.risk,100)/100) END
             + v_cfg.weight_tenure * LEAST(coalesce(p.tenure_days,0)::numeric / 365, 1)
           )))::integer score
      FROM public.cs_portfolio p
      LEFT JOIN conv ON conv.email = p.email
      LEFT JOIN risk ON risk.email = p.email
      LEFT JOIN csat ON csat.email = p.email
     WHERE p.is_active
  )
  UPDATE public.cs_portfolio p
     SET conversations_90d = sig.conv90,
         last_client_message_at = sig.last_client_msg,
         churn_risk_score = sig.risk,
         engagement_score = sig.score
    FROM sig WHERE sig.id = p.id;

  UPDATE public.cs_portfolio SET engagement_band = CASE
      WHEN engagement_score IS NULL THEN NULL
      WHEN engagement_score >= v_cfg.band_high THEN 'alto'
      WHEN engagement_score >= v_cfg.band_mid THEN 'medio'
      WHEN engagement_score >= v_cfg.band_low THEN 'baixo'
      ELSE 'silencioso' END
   WHERE is_active;

  WITH attrs AS (
    SELECT p.id, jsonb_build_object(
        'plano', p.plano, 'nome_oferta', p.nome_oferta, 'mrr', p.mrr,
        'origem_cliente', p.origem_cliente, 'recorrencia_pagamento', p.recorrencia_pagamento,
        'tenure_days', p.tenure_days, 'area', b.area, 'gateway', b.gateway,
        'industry', p.industry, 'engagement_score', p.engagement_score,
        'engagement_band', p.engagement_band
      ) a
      FROM public.cs_portfolio p LEFT JOIN tmp_base b ON b.email = p.email
     WHERE p.is_active
  ), best AS (
    SELECT a.id, (
      SELECT s.id FROM public.cs_segments s
       WHERE s.is_active AND public.cs_match_rules(a.a, s.rules)
       ORDER BY s.priority, s.created_at LIMIT 1
    ) segment_id
    FROM attrs a
  )
  UPDATE public.cs_portfolio p
     SET segment_id = best.segment_id,
         cadence_days = (SELECT s.cadence_days FROM public.cs_segments s WHERE s.id = best.segment_id)
    FROM best WHERE best.id = p.id;

  WITH rules AS (
    SELECT r.*, row_number() OVER (PARTITION BY r.segment_id ORDER BY r.position, r.created_at) rn
      FROM public.cs_assignment_rules r WHERE r.is_active AND array_length(r.cs_user_ids,1) > 0
  ), first_rule AS (
    SELECT * FROM rules WHERE rn = 1
  ), targets AS (
    SELECT p.id, fr.mode, fr.cs_user_ids,
           row_number() OVER (PARTITION BY p.segment_id ORDER BY p.mrr DESC, p.email) rn
      FROM public.cs_portfolio p
      JOIN first_rule fr ON fr.segment_id = p.segment_id
     WHERE p.is_active AND p.assignment_source <> 'manual'
  )
  UPDATE public.cs_portfolio p
     SET cs_user_id = CASE
           WHEN t.mode = 'round_robin'
             THEN t.cs_user_ids[1 + ((t.rn - 1) % array_length(t.cs_user_ids,1))]
           ELSE t.cs_user_ids[1] END,
         assignment_source = 'rule',
         assigned_at = now()
    FROM targets t WHERE t.id = p.id;
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  UPDATE public.cs_portfolio p
     SET next_contact_due = CASE
        WHEN p.last_contact_at IS NOT NULL
          THEN ((p.last_contact_at AT TIME ZONE 'America/Sao_Paulo')::date + coalesce(p.cadence_days,60))
        WHEN p.data_inicio IS NOT NULL
          THEN (p.data_inicio + coalesce(p.cadence_days,60))
        ELSE v_today END
   WHERE p.is_active;

  RETURN jsonb_build_object('upserted', v_inserted, 'deactivated', v_deactivated, 'assigned', v_assigned, 'snapshot', (SELECT max(snapshot) FROM tmp_base));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cs_portfolio_refresh() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cs_portfolio_refresh() TO authenticated;