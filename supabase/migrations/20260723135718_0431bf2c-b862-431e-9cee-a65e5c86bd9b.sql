-- 1) Nova tabela de eventos de churn
CREATE TABLE public.stripe_churn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  customer_email text,
  canceled_at timestamptz NOT NULL,
  mrr_lost numeric NOT NULL DEFAULT 0,
  plan_name text,
  stripe_price_id text,
  stripe_area text,
  assigned_seller_id uuid,
  cancellation_reason text,
  source text NOT NULL DEFAULT 'webhook',
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_churn_events TO authenticated;
GRANT ALL ON public.stripe_churn_events TO service_role;

ALTER TABLE public.stripe_churn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/tatico read churn"
  ON public.stripe_churn_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tatico'));

CREATE POLICY "Admin manage churn"
  ON public.stripe_churn_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_stripe_churn_events_canceled_at ON public.stripe_churn_events (canceled_at DESC);
CREATE INDEX idx_stripe_churn_events_customer ON public.stripe_churn_events (stripe_customer_id);
CREATE INDEX idx_stripe_churn_events_area ON public.stripe_churn_events (stripe_area);

CREATE TRIGGER trg_stripe_churn_events_updated
  BEFORE UPDATE ON public.stripe_churn_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Direção do alvo nas categorias
ALTER TABLE public.goal_categories
  ADD COLUMN IF NOT EXISTS goal_direction text NOT NULL DEFAULT 'gte'
  CHECK (goal_direction IN ('gte','lte'));

-- 3) Seeds de categorias de CS (churn)
INSERT INTO public.goal_categories (name, slug, area, metric_type, is_system, is_active, description, auto_source, goal_direction)
VALUES
  ('Churn de MRR', 'churn-mrr', 'cs', 'currency', true, true,
   'Soma do MRR perdido no período (cancelamentos Stripe). Meta é um teto — quanto menor, melhor.',
   'stripe_churn_mrr', 'lte'),
  ('Churn de Logos', 'churn-logos', 'cs', 'count', true, true,
   'Quantidade de clientes que cancelaram no período. Meta é um teto.',
   'stripe_churn_logos', 'lte'),
  ('Churn % (logos)', 'churn-rate-logos', 'cs', 'ratio', true, true,
   'Logos cancelados ÷ base ativa no início do período. Meta é um teto.',
   'stripe_churn_rate_logos', 'lte')
ON CONFLICT (slug) DO NOTHING;