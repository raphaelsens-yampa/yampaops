DELETE FROM public.tactical_goals g
USING public.tactical_goals g2
WHERE g.metric_id = g2.metric_id
  AND g.user_id IS NOT DISTINCT FROM g2.user_id
  AND g.team_id IS NOT DISTINCT FROM g2.team_id
  AND g.period_start = g2.period_start
  AND g.period_end = g2.period_end
  AND g.created_at < g2.created_at;