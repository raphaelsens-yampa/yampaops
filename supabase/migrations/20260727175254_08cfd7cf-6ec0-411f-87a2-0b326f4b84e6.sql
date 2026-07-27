ALTER TABLE public.goal_categories
  ADD COLUMN IF NOT EXISTS component_category_ids uuid[] NULL;

INSERT INTO public.goal_categories (name, slug, area, metric_type, goal_direction, auto_source, is_system, is_active, description, component_category_ids)
SELECT 'MRR Increase', 'mrr_increase', 'sales', 'mrr', 'gte', 'metabase', true, true,
       'Agrupamento: New MRR + Recuperados + Upsell',
       ARRAY[
         (SELECT id FROM public.goal_categories WHERE slug = 'new_mrr' OR (area='sales' AND name='New MRR') LIMIT 1),
         (SELECT id FROM public.goal_categories WHERE area='sales' AND name='Recuperados' LIMIT 1),
         (SELECT id FROM public.goal_categories WHERE area='sales' AND name='Upsell' LIMIT 1)
       ]::uuid[]
WHERE NOT EXISTS (SELECT 1 FROM public.goal_categories WHERE slug='mrr_increase');

INSERT INTO public.goal_categories (name, slug, area, metric_type, goal_direction, auto_source, is_system, is_active, description, component_category_ids)
SELECT 'MRR Decrease', 'mrr_decrease', 'cs', 'mrr', 'lte', 'metabase', true, true,
       'Agrupamento: Churn de MRR + Downsell (meta de teto)',
       ARRAY[
         (SELECT id FROM public.goal_categories WHERE area='cs' AND name='Churn de MRR' LIMIT 1),
         (SELECT id FROM public.goal_categories WHERE area='cs' AND name='Downsell' LIMIT 1)
       ]::uuid[]
WHERE NOT EXISTS (SELECT 1 FROM public.goal_categories WHERE slug='mrr_decrease');