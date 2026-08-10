ALTER TABLE public.metas_snapshot_diario ADD COLUMN IF NOT EXISTS origem_cliente text;
ALTER TABLE public.metabase_daily_raw ADD COLUMN IF NOT EXISTS origem_cliente text;
ALTER TABLE public.metabase_monthly_agg ADD COLUMN IF NOT EXISTS origem_cliente text;
ALTER TABLE public.tactical_manual_entries ADD COLUMN IF NOT EXISTS origem_cliente text NOT NULL DEFAULT 'yampa';
ALTER TABLE public.tactical_recoveries ADD COLUMN IF NOT EXISTS origem_cliente text NOT NULL DEFAULT 'yampa';

DROP INDEX IF EXISTS public.metas_snapshot_diario_uk;
CREATE UNIQUE INDEX metas_snapshot_diario_uk
  ON public.metas_snapshot_diario (data, metric_key, scope, COALESCE(lower(origem_cliente), ''));

CREATE INDEX IF NOT EXISTS metas_snapshot_diario_origem_idx
  ON public.metas_snapshot_diario (data, metric_key, origem_cliente);

DROP INDEX IF EXISTS public.ux_mb_monthly_dims;
DROP INDEX IF EXISTS public.metabase_monthly_agg_uk;
CREATE UNIQUE INDEX metabase_monthly_agg_uk
  ON public.metabase_monthly_agg (
    year_month, metric_key, scope,
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lower(origem_cliente), '')
  );

CREATE INDEX IF NOT EXISTS idx_mb_daily_origem
  ON public.metabase_daily_raw (capture_date, metric_key, origem_cliente);

CREATE OR REPLACE FUNCTION public.refresh_metabase_monthly_agg(p_from date, p_to date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.metabase_monthly_agg
  WHERE year_month >= date_trunc('month', p_from)::date
    AND year_month <= date_trunc('month', p_to)::date;

  INSERT INTO public.metabase_monthly_agg (
    year_month, metric_key, scope, team_id, user_id, campaign_id, area, category_id,
    origem_cliente, realized_amount, deals_count, last_synced_at
  )
  SELECT
    date_trunc('month', capture_date)::date AS year_month,
    metric_key, scope, team_id, user_id, campaign_id, area, category_id,
    origem_cliente,
    SUM(amount) AS realized_amount,
    SUM(deals_count) AS deals_count,
    now()
  FROM public.metabase_daily_raw
  WHERE capture_date >= date_trunc('month', p_from)::date
    AND capture_date < (date_trunc('month', p_to)::date + INTERVAL '1 month')
  GROUP BY 1,2,3,4,5,6,7,8,9;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;