INSERT INTO public.tactical_metrics (key, label, source, unit, is_active, sort_order, team_id)
VALUES
  ('upsell_dia', 'Upsell', 'manual', 'count', true, 100, NULL),
  ('recuperados_ft', 'Recuperados FT', 'manual', 'count', true, 110, NULL)
ON CONFLICT DO NOTHING;