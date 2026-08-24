-- ============ campaign_cohort_imports ============
CREATE TABLE public.campaign_cohort_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaign_history(id) ON DELETE CASCADE,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_cohort_imports TO authenticated;
GRANT ALL ON public.campaign_cohort_imports TO service_role;
ALTER TABLE public.campaign_cohort_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cohort_imports_manage" ON public.campaign_cohort_imports
  FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_cohort_imports_updated
  BEFORE UPDATE ON public.campaign_cohort_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ campaign_cohort_contacts ============
CREATE TABLE public.campaign_cohort_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaign_history(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_norm text NOT NULL,
  name text,
  offer text,
  activated_at date,
  source_import_id uuid REFERENCES public.campaign_cohort_imports(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email_norm)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_cohort_contacts TO authenticated;
GRANT ALL ON public.campaign_cohort_contacts TO service_role;
ALTER TABLE public.campaign_cohort_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cohort_contacts_manage" ON public.campaign_cohort_contacts
  FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_cohort_contacts_updated
  BEFORE UPDATE ON public.campaign_cohort_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cohort_contacts_campaign ON public.campaign_cohort_contacts(campaign_id);
CREATE INDEX idx_cohort_contacts_email_norm ON public.campaign_cohort_contacts(email_norm);

-- normalização de e-mail
CREATE OR REPLACE FUNCTION public.campaign_cohort_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := trim(NEW.email);
  NEW.email_norm := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cohort_contacts_normalize
  BEFORE INSERT OR UPDATE ON public.campaign_cohort_contacts
  FOR EACH ROW EXECUTE FUNCTION public.campaign_cohort_normalize();

-- ============ campaign_cohort_results ============
CREATE TABLE public.campaign_cohort_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaign_history(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.campaign_cohort_contacts(id) ON DELETE CASCADE,
  email_norm text NOT NULL,
  status text NOT NULL DEFAULT 'never',
  mrr numeric NOT NULL DEFAULT 0,
  plan_name text,
  offer_name text,
  origem_cliente text,
  started_at date,
  canceled_at date,
  churn_type text,
  source text,
  snapshot_date date,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_cohort_results TO authenticated;
GRANT ALL ON public.campaign_cohort_results TO service_role;
ALTER TABLE public.campaign_cohort_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cohort_results_manage" ON public.campaign_cohort_results
  FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_cohort_results_updated
  BEFORE UPDATE ON public.campaign_cohort_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cohort_results_campaign ON public.campaign_cohort_results(campaign_id);

-- ============ refresh function ============
CREATE OR REPLACE FUNCTION public.campaign_cohort_refresh(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      origem_cliente, started_at, canceled_at, churn_type, source, snapshot_date, computed_at
    )
    SELECT
      c.campaign_id, c.id, c.email_norm,
      CASE
        WHEN m.email_norm IS NOT NULL THEN
          CASE lower(coalesce(m.status_assinatura,''))
            WHEN 'ativo' THEN 'active'
            WHEN 'cancelado' THEN 'canceled'
            WHEN 'trial' THEN 'trial'
            ELSE 'unknown'
          END
        WHEN s.email_norm IS NOT NULL THEN
          CASE WHEN ch.canceled_at IS NOT NULL THEN 'canceled' ELSE 'active' END
        ELSE 'never'
      END,
      CASE
        WHEN m.email_norm IS NOT NULL THEN COALESCE(m.mrr, 0)
        WHEN s.email_norm IS NOT NULL AND ch.canceled_at IS NULL THEN COALESCE(s.mrr, 0)
        ELSE 0
      END,
      COALESCE(m.plano, s.plan_name),
      COALESCE(m.nome_oferta, s.product_name),
      m.origem_cliente,
      COALESCE(m.data_inicio, s.started_at),
      COALESCE(m.data_cancelamento, ch.canceled_at),
      COALESCE(m.tipo_churn, ch.cancellation_reason),
      CASE WHEN m.email_norm IS NOT NULL THEN 'metabase'
           WHEN s.email_norm IS NOT NULL THEN 'stripe'
           ELSE NULL END,
      CASE WHEN m.email_norm IS NOT NULL THEN v_snapshot ELSE NULL END,
      now()
    FROM contacts c
    LEFT JOIN mb m ON m.email_norm = c.email_norm
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
$$;

-- ============ histórico de cohort (curva M0..M12) ============
CREATE OR REPLACE FUNCTION public.campaign_cohort_curve(p_campaign_id uuid)
RETURNS TABLE(month_offset int, active_count int, mrr_total numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.email_norm,
           COALESCE(c.activated_at, r.started_at) AS act
    FROM public.campaign_cohort_contacts c
    LEFT JOIN public.campaign_cohort_results r ON r.contact_id = c.id
    WHERE c.campaign_id = p_campaign_id
  ),
  snaps AS (
    SELECT DISTINCT ON (date_trunc('month', data_snapshot), lower(email))
      date_trunc('month', data_snapshot)::date AS m,
      lower(email) AS email_norm,
      status_assinatura, mrr, data_snapshot
    FROM public.metas_ativos_pagantes_daily
    WHERE email IS NOT NULL AND email <> ''
    ORDER BY date_trunc('month', data_snapshot), lower(email), data_snapshot DESC
  )
  SELECT
    (((EXTRACT(YEAR FROM s.m) - EXTRACT(YEAR FROM date_trunc('month', b.act))) * 12)
      + (EXTRACT(MONTH FROM s.m) - EXTRACT(MONTH FROM date_trunc('month', b.act))))::int AS month_offset,
    COUNT(*) FILTER (WHERE lower(coalesce(s.status_assinatura,'')) = 'ativo')::int,
    COALESCE(SUM(s.mrr) FILTER (WHERE lower(coalesce(s.status_assinatura,'')) = 'ativo'), 0)::numeric
  FROM base b
  JOIN snaps s ON s.email_norm = b.email_norm
  WHERE b.act IS NOT NULL
    AND s.m >= date_trunc('month', b.act)::date
  GROUP BY 1
  HAVING (((EXTRACT(YEAR FROM s.m) - EXTRACT(YEAR FROM date_trunc('month', b.act))) * 12)
      + (EXTRACT(MONTH FROM s.m) - EXTRACT(MONTH FROM date_trunc('month', b.act))))::int BETWEEN 0 AND 12
  ORDER BY 1;
END;
$$;