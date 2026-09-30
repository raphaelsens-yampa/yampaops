-- 1) Base de snapshot: uma linha por assinatura ativa (sem deduplicar por e-mail)
CREATE OR REPLACE FUNCTION public.cs_snapshot_base()
RETURNS TABLE(email text, plano text, nome_oferta text, stripe_price_id text, mrr numeric, previous_mrr numeric, origem_cliente text, recorrencia_pagamento text, gateway text, data_inicio date, tenure_days integer, area text, snapshot date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH last AS (SELECT max(data_snapshot) d FROM public.metas_ativos_pagantes_daily)
  SELECT lower(trim(m.email)), m.plano, m.nome_oferta, m.stripe_price_id, coalesce(m.mrr,0),
         m.previous_mrr, m.origem_cliente, m.recorrencia_pagamento, m.gateway, m.data_inicio,
         CASE WHEN m.data_inicio IS NULL THEN NULL
              ELSE (((now() AT TIME ZONE 'America/Sao_Paulo')::date - m.data_inicio))::integer END,
         pm.seller_label, m.data_snapshot
  FROM public.metas_ativos_pagantes_daily m
  JOIN last l ON m.data_snapshot = l.d
  LEFT JOIN public.commission_price_map pm ON pm.price_id = m.stripe_price_id
  WHERE lower(coalesce(m.status_assinatura,'')) IN ('active','trialing','ativo','past_due')
    AND m.email IS NOT NULL AND trim(m.email) <> '';
$function$;

-- 2) Chave única por assinatura na carteira (coluna comum, preenchida pela rotina)
ALTER TABLE public.cs_portfolio DROP CONSTRAINT cs_portfolio_email_key;
ALTER TABLE public.cs_portfolio ADD COLUMN sub_key text;
UPDATE public.cs_portfolio
   SET sub_key = email || '|' || coalesce(stripe_price_id,'') || '|' || coalesce(to_char(data_inicio,'YYYY-MM-DD'),'');
ALTER TABLE public.cs_portfolio ALTER COLUMN sub_key SET NOT NULL;
ALTER TABLE public.cs_portfolio ADD CONSTRAINT cs_portfolio_sub_key_key UNIQUE (sub_key);

-- 3) Divide as duplicidades existentes: a linha atual fica com a maior assinatura
WITH last AS (SELECT max(data_snapshot) d FROM public.metas_ativos_pagantes_daily),
subs AS (
  SELECT lower(trim(m.email)) email, m.plano, m.nome_oferta, m.stripe_price_id, m.mrr, m.previous_mrr,
         m.origem_cliente, m.recorrencia_pagamento, m.data_inicio, m.data_snapshot,
         row_number() OVER (PARTITION BY lower(trim(m.email)) ORDER BY m.mrr DESC NULLS LAST) rn
  FROM public.metas_ativos_pagantes_daily m, last l
  WHERE m.data_snapshot = l.d
    AND lower(coalesce(m.status_assinatura,'')) IN ('active','trialing','ativo','past_due')
    AND m.email IS NOT NULL AND trim(m.email) <> ''
),
dups AS (SELECT email FROM subs GROUP BY email HAVING count(*) > 1)
UPDATE public.cs_portfolio p
   SET plano = s.plano, nome_oferta = s.nome_oferta, stripe_price_id = s.stripe_price_id,
       mrr = coalesce(s.mrr,0), previous_mrr = s.previous_mrr, origem_cliente = s.origem_cliente,
       recorrencia_pagamento = s.recorrencia_pagamento, data_inicio = s.data_inicio,
       last_snapshot = s.data_snapshot,
       sub_key = s.email || '|' || coalesce(s.stripe_price_id,'') || '|' || coalesce(to_char(s.data_inicio,'YYYY-MM-DD'),'')
  FROM subs s JOIN dups d ON d.email = s.email
 WHERE s.rn = 1 AND p.email = s.email;

-- 4) Insere as assinaturas adicionais copiando responsável, segmento e demais dados
WITH last AS (SELECT max(data_snapshot) d FROM public.metas_ativos_pagantes_daily),
subs AS (
  SELECT lower(trim(m.email)) email, m.plano, m.nome_oferta, m.stripe_price_id, m.mrr, m.previous_mrr,
         m.origem_cliente, m.recorrencia_pagamento, m.data_inicio, m.data_snapshot,
         row_number() OVER (PARTITION BY lower(trim(m.email)) ORDER BY m.mrr DESC NULLS LAST) rn
  FROM public.metas_ativos_pagantes_daily m, last l
  WHERE m.data_snapshot = l.d
    AND lower(coalesce(m.status_assinatura,'')) IN ('active','trialing','ativo','past_due')
    AND m.email IS NOT NULL AND trim(m.email) <> ''
),
dups AS (SELECT email FROM subs GROUP BY email HAVING count(*) > 1)
INSERT INTO public.cs_portfolio (email, company_name, cs_user_id, segment_id, assignment_source, assigned_by, assigned_at,
    plano, nome_oferta, stripe_price_id, mrr, previous_mrr, origem_cliente, recorrencia_pagamento, data_inicio, tenure_days,
    industry, engagement_score, engagement_band, churn_risk_score, conversations_90d, last_client_message_at, last_contact_at,
    next_contact_due, cadence_days, is_active, last_snapshot, sub_key)
SELECT p.email, p.company_name, p.cs_user_id, p.segment_id, p.assignment_source, p.assigned_by, p.assigned_at,
       s.plano, s.nome_oferta, s.stripe_price_id, coalesce(s.mrr,0), s.previous_mrr, s.origem_cliente, s.recorrencia_pagamento, s.data_inicio,
       p.tenure_days, p.industry, p.engagement_score, p.engagement_band, p.churn_risk_score, p.conversations_90d, p.last_client_message_at,
       p.last_contact_at, p.next_contact_due, p.cadence_days, true, s.data_snapshot,
       s.email || '|' || coalesce(s.stripe_price_id,'') || '|' || coalesce(to_char(s.data_inicio,'YYYY-MM-DD'),'')
  FROM subs s
  JOIN dups d ON d.email = s.email
  JOIN public.cs_portfolio p ON p.email = s.email
 WHERE s.rn > 1;

-- 5) Refresh passa a gravar e desativar por assinatura (sub_key)
CREATE OR REPLACE FUNCTION public.cs_portfolio_refresh()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_cfg public.cs_engagement_config;
  v_inserted integer := 0; v_deactivated integer := 0; v_assigned integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO v_cfg FROM public.cs_engagement_config ORDER BY created_at LIMIT 1;

  CREATE TEMP TABLE tmp_base ON COMMIT DROP AS
  SELECT *, email || '|' || coalesce(stripe_price_id,'') || '|' || coalesce(to_char(data_inicio,'YYYY-MM-DD'),'') AS sub_key
    FROM public.cs_snapshot_base();

  INSERT INTO public.cs_portfolio (email, plano, nome_oferta, stripe_price_id, mrr, previous_mrr,
      origem_cliente, recorrencia_pagamento, data_inicio, tenure_days, is_active, last_snapshot, sub_key)
  SELECT b.email, b.plano, b.nome_oferta, b.stripe_price_id, b.mrr, b.previous_mrr,
      b.origem_cliente, b.recorrencia_pagamento, b.data_inicio, b.tenure_days, true, b.snapshot, b.sub_key
  FROM tmp_base b
  ON CONFLICT (sub_key) DO UPDATE SET
      plano = EXCLUDED.plano, nome_oferta = EXCLUDED.nome_oferta,
      stripe_price_id = EXCLUDED.stripe_price_id, mrr = EXCLUDED.mrr,
      previous_mrr = EXCLUDED.previous_mrr, origem_cliente = EXCLUDED.origem_cliente,
      recorrencia_pagamento = EXCLUDED.recorrencia_pagamento, data_inicio = EXCLUDED.data_inicio,
      tenure_days = EXCLUDED.tenure_days, is_active = true, last_snapshot = EXCLUDED.last_snapshot;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.cs_portfolio p SET is_active = false
   WHERE p.is_active AND NOT EXISTS (SELECT 1 FROM tmp_base b WHERE b.sub_key = p.sub_key);
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
      FROM public.cs_portfolio p LEFT JOIN tmp_base b ON b.sub_key = p.sub_key
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