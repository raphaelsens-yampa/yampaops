CREATE TABLE public.metas_pre_churn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id bigint NOT NULL,
  email_norm text,
  phone text,
  tipo text NOT NULL,
  motivo text,
  descricao text,
  plano text,
  segmento text,
  origem_cliente text,
  sck text,
  mrr numeric NOT NULL DEFAULT 0,
  data_ref date NOT NULL,
  data_pedido date,
  data_pagamento date,
  inicio_vigencia date,
  final_vigencia date,
  future_churn_at date,
  dias_atraso int,
  vitalicio boolean NOT NULL DEFAULT false,
  reembolso boolean,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, data_ref, tipo)
);
CREATE INDEX idx_pre_churn_email ON public.metas_pre_churn(email_norm);
CREATE INDEX idx_pre_churn_ref ON public.metas_pre_churn(data_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_pre_churn TO authenticated;
GRANT ALL ON public.metas_pre_churn TO service_role;
ALTER TABLE public.metas_pre_churn ENABLE ROW LEVEL SECURITY;
CREATE POLICY pre_churn_read ON public.metas_pre_churn FOR SELECT TO authenticated USING (true);
CREATE POLICY pre_churn_write ON public.metas_pre_churn FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TABLE public.campaign_plan_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_campaign_ids uuid[] NOT NULL DEFAULT '{}',
  goal_type text NOT NULL,
  goal_value numeric,
  investment numeric,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_campaign_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_plan_scenarios TO authenticated;
GRANT ALL ON public.campaign_plan_scenarios TO service_role;
ALTER TABLE public.campaign_plan_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY cps_read ON public.campaign_plan_scenarios FOR SELECT TO authenticated USING (true);
CREATE POLICY cps_write ON public.campaign_plan_scenarios FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TABLE public.churn_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'geral',
  period_from date,
  period_to date,
  insights jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.churn_ai_insights TO authenticated;
GRANT ALL ON public.churn_ai_insights TO service_role;
ALTER TABLE public.churn_ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY cai_read ON public.churn_ai_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY cai_write ON public.churn_ai_insights FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));