ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_pct numeric NOT NULL DEFAULT 0;

-- Churn % (logos): valores < 6 viram percentual
UPDATE public.goals
SET target_pct = target_mrr, target_mrr = 0
WHERE category_id = '6cad7515-3ae0-40b9-9586-e425a29e8db5'
  AND target_pct = 0
  AND target_mrr > 0 AND target_mrr < 6;

UPDATE public.goals
SET target_pct = target_deals, target_deals = 0
WHERE category_id = '6cad7515-3ae0-40b9-9586-e425a29e8db5'
  AND target_pct = 0
  AND target_deals > 0 AND target_deals < 6;

-- Churn % (logos) com valor > 6 -> categoria Churn de Logos
UPDATE public.goals
SET category_id = '5f4c62ff-97ad-48c7-a984-19c497cfd134'
WHERE category_id = '6cad7515-3ae0-40b9-9586-e425a29e8db5'
  AND (target_deals > 6 OR target_mrr > 6);

-- valores de MRR > 6 em categoria de contagem passam para deals
UPDATE public.goals
SET target_deals = target_mrr::int, target_mrr = 0
WHERE category_id = '5f4c62ff-97ad-48c7-a984-19c497cfd134'
  AND target_deals = 0 AND target_mrr > 6;