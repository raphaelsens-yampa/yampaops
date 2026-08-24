CREATE TABLE public.metas_churn_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_norm text NOT NULL,
  company_id text,
  plano text,
  nome_oferta text,
  gateway text,
  mrr numeric,
  data_inicio date,
  data_cancelamento date NOT NULL,
  tipo_churn text,
  motivo text,
  fonte text NOT NULL DEFAULT 'metabase',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX metas_churn_historico_email_data_key
  ON public.metas_churn_historico (email_norm, data_cancelamento);
CREATE INDEX metas_churn_historico_email_idx ON public.metas_churn_historico (email_norm);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_churn_historico TO authenticated;
GRANT ALL ON public.metas_churn_historico TO service_role;

ALTER TABLE public.metas_churn_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tatico e admin gerenciam churn historico"
ON public.metas_churn_historico FOR ALL TO authenticated
USING (public.is_tatico_or_admin(auth.uid()))
WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER metas_churn_historico_updated_at
BEFORE UPDATE ON public.metas_churn_historico
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Carga inicial a partir dos snapshots já existentes
INSERT INTO public.metas_churn_historico (
  email_norm, company_id, plano, nome_oferta, gateway, mrr,
  data_inicio, data_cancelamento, tipo_churn, fonte
)
SELECT DISTINCT ON (lower(a.email), a.data_cancelamento)
  lower(a.email), a.company_id, a.plano, a.nome_oferta, a.gateway, a.mrr,
  a.data_inicio, a.data_cancelamento, a.tipo_churn, 'metabase'
FROM public.metas_ativos_pagantes_daily a
WHERE a.email IS NOT NULL AND a.email <> ''
  AND a.data_cancelamento IS NOT NULL
ORDER BY lower(a.email), a.data_cancelamento, a.data_snapshot DESC
ON CONFLICT (email_norm, data_cancelamento) DO NOTHING;

ALTER TABLE public.campaign_cohort_results
  ADD COLUMN IF NOT EXISTS churn_source text;

CREATE OR REPLACE FUNCTION public.campaign_cohort_refresh(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  ins AS (
    INSERT INTO public.campaign_cohort_results (
      campaign_id, contact_id, email_norm, status, mrr, plan_name, offer_name,
      origem_cliente, started_at, canceled_at, churn_type, source, churn_source,
      snapshot_date, computed_at
    )
    SELECT
      c.campaign_id, c.id, c.email_norm,
      CASE
        WHEN m.email_norm IS NOT NULL AND lower(coalesce(m.status_assinatura,'')) = 'ativo' THEN 'active'
        WHEN m.email_norm IS NOT NULL AND lower(coalesce(m.status_assinatura,'')) = 'trial' THEN 'trial'
        WHEN m.email_norm IS NOT NULL AND lower(coalesce(m.status_assinatura,'')) = 'cancelado' THEN 'canceled'
        WHEN h.email_norm IS NOT NULL THEN 'canceled'
        WHEN m.email_norm IS NOT NULL THEN 'unknown'
        WHEN s.email_norm IS NOT NULL THEN
          CASE WHEN ch.canceled_at IS NOT NULL THEN 'canceled' ELSE 'active' END
        ELSE 'never'
      END,
      CASE
        WHEN m.email_norm IS NOT NULL THEN COALESCE(m.mrr, 0)
        WHEN h.email_norm IS NOT NULL THEN COALESCE(h.mrr, 0)
        WHEN s.email_norm IS NOT NULL AND ch.canceled_at IS NULL THEN COALESCE(s.mrr, 0)
        ELSE 0
      END,
      COALESCE(m.plano, h.plano, s.plan_name),
      COALESCE(m.nome_oferta, h.nome_oferta, s.product_name),
      m.origem_cliente,
      COALESCE(m.data_inicio, h.data_inicio, s.started_at),
      COALESCE(m.data_cancelamento, h.data_cancelamento, ch.canceled_at),
      COALESCE(m.tipo_churn, h.tipo_churn, h.motivo, ch.cancellation_reason),
      CASE WHEN m.email_norm IS NOT NULL THEN 'metabase'
           WHEN h.email_norm IS NOT NULL THEN 'metabase'
           WHEN s.email_norm IS NOT NULL THEN 'stripe'
           ELSE NULL END,
      CASE WHEN m.data_cancelamento IS NOT NULL THEN 'snapshot'
           WHEN h.data_cancelamento IS NOT NULL THEN COALESCE(h.fonte, 'metabase')
           WHEN ch.canceled_at IS NOT NULL THEN 'stripe'
           ELSE NULL END,
      CASE WHEN m.email_norm IS NOT NULL THEN v_snapshot ELSE NULL END,
      now()
    FROM contacts c
    LEFT JOIN mb m ON m.email_norm = c.email_norm
    LEFT JOIN hist h ON h.email_norm = c.email_norm
    LEFT JOIN sc s ON s.email_norm = c.email_norm
    LEFT JOIN churn ch ON ch.email_norm = c.email_norm
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