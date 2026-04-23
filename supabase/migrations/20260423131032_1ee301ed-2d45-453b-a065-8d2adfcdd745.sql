-- 1. goal_categories
CREATE TABLE public.goal_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL CHECK (area IN ('sales','cs','campaign','financial')),
  metric_type TEXT NOT NULL DEFAULT 'mrr' CHECK (metric_type IN ('mrr','count','ratio','currency')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view goal_categories"
ON public.goal_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage goal_categories"
ON public.goal_categories FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_goal_categories_updated_at
BEFORE UPDATE ON public.goal_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed
INSERT INTO public.goal_categories (name, slug, area, metric_type, is_system, description) VALUES
  ('New MRR', 'new_mrr', 'sales', 'mrr', true, 'Receita recorrente nova de Sales'),
  ('Recuperados', 'recuperados', 'sales', 'mrr', true, 'MRR recuperado por Sales'),
  ('Upsell', 'upsell', 'sales', 'mrr', true, 'Expansão de receita em base existente'),
  ('Retenção (Pré-churn)', 'retencao', 'cs', 'mrr', true, 'MRR retido em pré-churn'),
  ('Recuperação (Churn)', 'recuperacao_churn', 'cs', 'mrr', true, 'MRR recuperado pós-churn'),
  ('Downsell', 'downsell', 'cs', 'mrr', true, 'MRR reduzido evitando churn total'),
  ('Campanha MRR', 'campanha_mrr', 'campaign', 'mrr', true, 'MRR oriundo de campanhas'),
  ('LTV', 'ltv', 'financial', 'currency', true, 'Lifetime Value calculado'),
  ('CAC', 'cac', 'financial', 'currency', true, 'Custo de Aquisição de Cliente'),
  ('LTV/CAC', 'ltv_cac', 'financial', 'ratio', true, 'Razão LTV sobre CAC');

-- 2. finance_settings
CREATE TABLE public.finance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  avg_churn_rate NUMERIC NOT NULL DEFAULT 5,
  avg_campaign_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view finance_settings"
ON public.finance_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage finance_settings"
ON public.finance_settings FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_finance_settings_updated_at
BEFORE UPDATE ON public.finance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.finance_settings (avg_churn_rate, avg_campaign_cost) VALUES (5, 0);

-- 3. category_id em goals e opportunities
ALTER TABLE public.goals ADD COLUMN category_id UUID;
ALTER TABLE public.opportunities ADD COLUMN category_id UUID;

CREATE INDEX idx_goals_category ON public.goals(category_id);
CREATE INDEX idx_opportunities_category ON public.opportunities(category_id);