
-- 1) tactical_metrics
CREATE TABLE public.tactical_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  source text NOT NULL CHECK (source IN ('activity_type','stripe_mrr','stripe_deals','manual')),
  activity_type text,
  unit text NOT NULL DEFAULT 'count' CHECK (unit IN ('count','currency')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tactical_metrics TO authenticated;
GRANT ALL ON public.tactical_metrics TO service_role;
ALTER TABLE public.tactical_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tactical_metrics_read_all" ON public.tactical_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "tactical_metrics_admin_write" ON public.tactical_metrics FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE TRIGGER trg_tactical_metrics_updated BEFORE UPDATE ON public.tactical_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) tactical_goals
CREATE TABLE public.tactical_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES public.tactical_metrics(id) ON DELETE CASCADE,
  user_id uuid,
  daily_target numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  derived_from_goal_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tactical_goals_metric ON public.tactical_goals(metric_id);
CREATE INDEX idx_tactical_goals_user ON public.tactical_goals(user_id);
CREATE INDEX idx_tactical_goals_period ON public.tactical_goals(period_start, period_end);
GRANT SELECT ON public.tactical_goals TO authenticated;
GRANT ALL ON public.tactical_goals TO service_role;
ALTER TABLE public.tactical_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tactical_goals_read_all" ON public.tactical_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "tactical_goals_admin_write" ON public.tactical_goals FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE TRIGGER trg_tactical_goals_updated BEFORE UPDATE ON public.tactical_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) tactical_manual_entries
CREATE TABLE public.tactical_manual_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES public.tactical_metrics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  value numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tactical_entries_user_date ON public.tactical_manual_entries(user_id, entry_date);
CREATE INDEX idx_tactical_entries_metric_date ON public.tactical_manual_entries(metric_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_manual_entries TO authenticated;
GRANT ALL ON public.tactical_manual_entries TO service_role;
ALTER TABLE public.tactical_manual_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tactical_entries_read_own_or_admin" ON public.tactical_manual_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "tactical_entries_insert_own" ON public.tactical_manual_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "tactical_entries_update_own" ON public.tactical_manual_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "tactical_entries_delete_own" ON public.tactical_manual_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_tatico_or_admin(auth.uid()));
CREATE TRIGGER trg_tactical_entries_updated BEFORE UPDATE ON public.tactical_manual_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed catálogo de métricas
INSERT INTO public.tactical_metrics (key, label, source, activity_type, unit, sort_order) VALUES
  ('mensagem_enviada', 'Mensagens enviadas', 'activity_type', 'mensagem_enviada', 'count', 10),
  ('resposta_recebida', 'Respostas recebidas', 'activity_type', 'resposta_recebida', 'count', 20),
  ('call_realizada', 'Calls realizadas', 'activity_type', 'call_realizada', 'count', 30),
  ('reuniao_executada', 'Reuniões executadas', 'activity_type', 'reuniao_executada', 'count', 40),
  ('whatsapp', 'WhatsApp', 'activity_type', 'whatsapp', 'count', 50),
  ('proposta', 'Propostas enviadas', 'activity_type', 'proposta', 'count', 60),
  ('mrr_dia', 'MRR do dia', 'stripe_mrr', NULL, 'currency', 70),
  ('vendas_dia', 'Vendas do dia', 'stripe_deals', NULL, 'count', 80);
