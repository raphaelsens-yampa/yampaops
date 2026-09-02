ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS origem_cliente text NULL;

CREATE INDEX IF NOT EXISTS goals_category_period_origin_idx
  ON public.goals (category_id, period_start, origem_cliente);