CREATE TABLE public.campaign_cohort_mrr_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaign_history(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.campaign_cohort_contacts(id) ON DELETE CASCADE,
  mrr numeric NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_cohort_mrr_overrides TO authenticated;
GRANT ALL ON public.campaign_cohort_mrr_overrides TO service_role;

ALTER TABLE public.campaign_cohort_mrr_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tatico ou admin gerencia overrides de MRR do cohort"
ON public.campaign_cohort_mrr_overrides FOR ALL TO authenticated
USING (public.is_tatico_or_admin(auth.uid()))
WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER update_campaign_cohort_mrr_overrides_updated_at
BEFORE UPDATE ON public.campaign_cohort_mrr_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cohort_mrr_overrides_campaign ON public.campaign_cohort_mrr_overrides(campaign_id);

CREATE OR REPLACE FUNCTION public.campaign_cohort_curve(p_campaign_id uuid)
 RETURNS TABLE(month_offset integer, active_count integer, mrr_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.email_norm,
           COALESCE(c.activated_at, r.started_at) AS act,
           o.mrr AS override_mrr
    FROM public.campaign_cohort_contacts c
    LEFT JOIN public.campaign_cohort_results r ON r.contact_id = c.id
    LEFT JOIN public.campaign_cohort_mrr_overrides o ON o.contact_id = c.id
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
    COALESCE(SUM(COALESCE(b.override_mrr, s.mrr)) FILTER (WHERE lower(coalesce(s.status_assinatura,'')) = 'ativo'), 0)::numeric
  FROM base b
  JOIN snaps s ON s.email_norm = b.email_norm
  WHERE b.act IS NOT NULL
    AND s.m >= date_trunc('month', b.act)::date
  GROUP BY 1
  HAVING (((EXTRACT(YEAR FROM s.m) - EXTRACT(YEAR FROM date_trunc('month', b.act))) * 12)
      + (EXTRACT(MONTH FROM s.m) - EXTRACT(MONTH FROM date_trunc('month', b.act))))::int BETWEEN 0 AND 12
  ORDER BY 1;
END;
$function$;