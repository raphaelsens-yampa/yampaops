CREATE TABLE public.campaign_history_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  unit text NOT NULL DEFAULT 'number',
  direction text NOT NULL DEFAULT 'higher',
  section text,
  is_funnel boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  ref_month date,
  start_date date,
  end_date date,
  channel text,
  owner_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_history_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaign_history(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.campaign_history_metrics(id) ON DELETE CASCADE,
  target_value numeric,
  actual_value numeric,
  funnel_target_pct numeric,
  funnel_actual_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, metric_id)
);

CREATE INDEX idx_campaign_history_values_campaign ON public.campaign_history_values(campaign_id);
CREATE INDEX idx_campaign_history_ref_month ON public.campaign_history(ref_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_history_metrics TO authenticated;
GRANT ALL ON public.campaign_history_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_history TO authenticated;
GRANT ALL ON public.campaign_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_history_values TO authenticated;
GRANT ALL ON public.campaign_history_values TO service_role;

ALTER TABLE public.campaign_history_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_history_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view campaign_history_metrics" ON public.campaign_history_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tatico or admin manage campaign_history_metrics" ON public.campaign_history_metrics FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE POLICY "Authenticated can view campaign_history" ON public.campaign_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tatico or admin manage campaign_history" ON public.campaign_history FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE POLICY "Authenticated can view campaign_history_values" ON public.campaign_history_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tatico or admin manage campaign_history_values" ON public.campaign_history_values FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_campaign_history_metrics_updated BEFORE UPDATE ON public.campaign_history_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_campaign_history_updated BEFORE UPDATE ON public.campaign_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_campaign_history_values_updated BEFORE UPDATE ON public.campaign_history_values FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.campaign_history_metrics (slug, label, unit, direction, section, is_funnel, position) VALUES
('investimento', 'Investimento', 'currency', 'higher', 'Investimento e Receita', false, 10),
('faturamento_ingressos', 'Faturamento Ingressos', 'currency', 'higher', 'Investimento e Receita', false, 20),
('vendas_ws', 'Vendas WS', 'currency', 'higher', 'Investimento e Receita', false, 30),
('vendas_ob', 'Vendas OB', 'currency', 'higher', 'Investimento e Receita', false, 40),
('custos', 'Custos', 'currency', 'lower', 'Investimento e Receita', false, 50),
('investimento_liquido', 'Investimento Líquido', 'currency', 'higher', 'Investimento e Receita', false, 60),
('cpl', 'CPL', 'currency', 'lower', 'Investimento e Receita', false, 70),
('cpl_liquido', 'CPL Líquido', 'currency', 'lower', 'Investimento e Receita', false, 80),
('leads_total', 'Leads (Total)', 'number', 'higher', 'Funil', false, 90),
('leads_ads', 'Leads (Ads)', 'number', 'higher', 'Funil', false, 100),
('leads_base', 'Leads (Base)', 'number', 'higher', 'Funil', false, 110),
('leads_wpp', 'Leads no Wpp (c/ saídas)', 'number', 'higher', 'Funil', true, 120),
('audiencia_live_unicos', 'Audiência Live (Usuários Únicos)', 'number', 'higher', 'Funil', false, 130),
('audiencia_live_pico', 'Audiência Live (Pico)', 'number', 'higher', 'Funil', true, 140),
('pre_pitch', 'Pré-Pitch', 'number', 'higher', 'Funil', true, 150),
('pitch', 'Pitch', 'number', 'higher', 'Funil', true, 160),
('iniciativas', 'Iniciativas', 'number', 'higher', 'Resultado', true, 170),
('conversao', 'Conversão', 'number', 'higher', 'Resultado', true, 180),
('cac', 'CAC', 'currency', 'lower', 'Resultado', false, 190),
('cac_liquido', 'CAC Líquido', 'currency', 'lower', 'Resultado', false, 200),
('fat_anualizado', 'Fat. Anualizado', 'currency', 'higher', 'Resultado', false, 210),
('investibilidade', 'Investibilidade', 'percent', 'higher', 'Resultado', false, 220),
('caixa_yampa', 'Caixa yampa', 'currency', 'higher', 'Resultado', false, 230),
('mrr', 'MRR', 'currency', 'higher', 'Resultado', false, 240),
('ltv', 'LTV', 'currency', 'higher', 'Resultado', false, 250),
('ltv_cac', 'LTV/CAC', 'multiple', 'higher', 'Resultado', false, 260),
('tempo_roi', 'Tempo de ROI', 'number', 'higher', 'Resultado', false, 270);