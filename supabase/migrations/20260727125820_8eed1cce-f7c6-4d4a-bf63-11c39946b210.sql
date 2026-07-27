
CREATE TABLE public.metabase_daily_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  capture_date DATE NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric_key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'company',
  team_id UUID,
  user_id UUID,
  campaign_id UUID,
  area TEXT,
  category_id UUID REFERENCES public.goal_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  deals_count INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  source TEXT NOT NULL DEFAULT 'metabase',
  source_url TEXT,
  raw_payload JSONB,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mb_raw_date ON public.metabase_daily_raw (capture_date);
CREATE INDEX idx_mb_raw_metric ON public.metabase_daily_raw (metric_key);
CREATE INDEX idx_mb_raw_scope ON public.metabase_daily_raw (scope, user_id, team_id, campaign_id);
CREATE INDEX idx_mb_raw_category ON public.metabase_daily_raw (category_id);

GRANT SELECT ON public.metabase_daily_raw TO authenticated;
GRANT ALL ON public.metabase_daily_raw TO service_role;
ALTER TABLE public.metabase_daily_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read metabase raw"
  ON public.metabase_daily_raw FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_mb_raw_updated_at
  BEFORE UPDATE ON public.metabase_daily_raw
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.metabase_monthly_agg (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month DATE NOT NULL,
  metric_key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'company',
  team_id UUID,
  user_id UUID,
  campaign_id UUID,
  area TEXT,
  category_id UUID REFERENCES public.goal_categories(id) ON DELETE SET NULL,
  realized_amount NUMERIC NOT NULL DEFAULT 0,
  deals_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_mb_monthly_dims ON public.metabase_monthly_agg (
  year_month, metric_key, scope,
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX idx_mb_monthly_ym ON public.metabase_monthly_agg (year_month);
CREATE INDEX idx_mb_monthly_metric ON public.metabase_monthly_agg (metric_key);

GRANT SELECT ON public.metabase_monthly_agg TO authenticated;
GRANT ALL ON public.metabase_monthly_agg TO service_role;
ALTER TABLE public.metabase_monthly_agg ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read metabase monthly"
  ON public.metabase_monthly_agg FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_mb_monthly_updated_at
  BEFORE UPDATE ON public.metabase_monthly_agg
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE OR REPLACE FUNCTION public.refresh_metabase_monthly_agg(p_from DATE, p_to DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.metabase_monthly_agg
  WHERE year_month >= date_trunc('month', p_from)::date
    AND year_month <= date_trunc('month', p_to)::date;

  INSERT INTO public.metabase_monthly_agg (
    year_month, metric_key, scope, team_id, user_id, campaign_id, area, category_id,
    realized_amount, deals_count, last_synced_at
  )
  SELECT
    date_trunc('month', capture_date)::date AS year_month,
    metric_key, scope, team_id, user_id, campaign_id, area, category_id,
    SUM(amount) AS realized_amount,
    SUM(deals_count) AS deals_count,
    now()
  FROM public.metabase_daily_raw
  WHERE capture_date >= date_trunc('month', p_from)::date
    AND capture_date < (date_trunc('month', p_to)::date + INTERVAL '1 month')
  GROUP BY 1,2,3,4,5,6,7,8;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
