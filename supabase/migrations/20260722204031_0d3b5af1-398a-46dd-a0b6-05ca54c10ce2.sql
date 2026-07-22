
-- Drop campos zumbis do funil (não usados em nenhuma tela)
ALTER TABLE public.goals
  DROP COLUMN IF EXISTS target_prospeccoes,
  DROP COLUMN IF EXISTS target_respostas,
  DROP COLUMN IF EXISTS target_agendamentos,
  DROP COLUMN IF EXISTS target_comparecimentos,
  DROP COLUMN IF EXISTS target_conversoes,
  DROP COLUMN IF EXISTS target_taxa_resposta,
  DROP COLUMN IF EXISTS target_taxa_agendamento,
  DROP COLUMN IF EXISTS target_taxa_comparecimento,
  DROP COLUMN IF EXISTS target_taxa_conversao,
  DROP COLUMN IF EXISTS channel;

-- Escopo campaign vinculado a sales_campaigns
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.sales_campaigns(id) ON DELETE SET NULL;

-- Mapeamento configurável Stripe ↔ categoria
ALTER TABLE public.goal_categories
  ADD COLUMN IF NOT EXISTS stripe_area text,
  ADD COLUMN IF NOT EXISTS auto_source text NOT NULL DEFAULT 'manual';

-- Backfill baseado nos slugs conhecidos
UPDATE public.goal_categories SET stripe_area='Sales',     auto_source='stripe'         WHERE slug='new_mrr';
UPDATE public.goal_categories SET stripe_area='Marketing', auto_source='stripe'         WHERE slug='campanha_mrr';
UPDATE public.goal_categories SET auto_source='stripe_ltv'                              WHERE slug='ltv';
UPDATE public.goal_categories SET auto_source='stripe_cac'                              WHERE slug='cac';
UPDATE public.goal_categories SET auto_source='stripe_ltv_cac'                          WHERE slug='ltv_cac';
UPDATE public.goal_categories SET auto_source='deals_count'                             WHERE slug IN ('recuperados','upsell','downsell','retencao','recuperacao_churn') AND auto_source='manual';

-- Reconciliação de órfãs por área do time
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS stripe_area text;

UPDATE public.teams SET stripe_area = name WHERE stripe_area IS NULL;
