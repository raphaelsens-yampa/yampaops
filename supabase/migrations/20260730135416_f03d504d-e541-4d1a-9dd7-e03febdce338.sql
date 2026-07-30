ALTER TABLE public.tactical_metrics ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.tactical_goals ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE public.tactical_metrics DROP CONSTRAINT IF EXISTS tactical_metrics_source_check;
ALTER TABLE public.tactical_metrics ADD CONSTRAINT tactical_metrics_source_check
  CHECK (source IN ('activity_type','stripe_mrr','stripe_deals','stripe_reactivation','manual'));

INSERT INTO public.tactical_metrics (key, label, source, activity_type, unit, is_active, sort_order, team_id)
SELECT 'clientes_recuperados', 'Clientes recuperados', 'stripe_reactivation', NULL, 'count', true, 90,
       (SELECT id FROM public.teams WHERE name = 'CS' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.tactical_metrics WHERE key = 'clientes_recuperados');

UPDATE public.tactical_metrics
   SET team_id = (SELECT id FROM public.teams WHERE name = 'Sales' LIMIT 1)
 WHERE key IN ('mrr_dia','vendas_dia') AND team_id IS NULL;