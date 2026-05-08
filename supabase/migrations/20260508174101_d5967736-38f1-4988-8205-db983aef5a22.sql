
-- Fase 1.1 — Configurações de amostragem
ALTER TABLE public.chatwoot_audit_settings
  ADD COLUMN IF NOT EXISTS sampling_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sampling_percent_per_seller numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS sampling_new_seller_days int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sampling_new_seller_percent numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS must_audit_lost boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_audit_critical boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_audit_sla_breach boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sla_breach_seconds int NOT NULL DEFAULT 1800;

-- Fase 1.2 — Override humano
ALTER TABLE public.chatwoot_conversation_audits
  ADD COLUMN IF NOT EXISTS human_overall_score numeric,
  ADD COLUMN IF NOT EXISTS human_severity text,
  ADD COLUMN IF NOT EXISTS human_notes text,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS human_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS human_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_seen_at timestamptz;

-- Fase 2.1 — Versionamento de rubrica
CREATE TABLE IF NOT EXISTS public.chatwoot_audit_rubric_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label text,
  scoring_rubric text,
  playbook_markdown text,
  playbook_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  tone_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  churn_signal_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_instructions text,
  ai_model text,
  created_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chatwoot_audit_rubric_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rubric_versions" ON public.chatwoot_audit_rubric_versions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view rubric_versions" ON public.chatwoot_audit_rubric_versions
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

ALTER TABLE public.chatwoot_conversation_audits
  ADD COLUMN IF NOT EXISTS rubric_version_id uuid;

-- Fase 2.2 — Golden set
CREATE TABLE IF NOT EXISTS public.chatwoot_audit_golden_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id bigint NOT NULL UNIQUE,
  expected_severity text NOT NULL,
  expected_overall_score numeric,
  expected_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chatwoot_audit_golden_set ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage golden_set" ON public.chatwoot_audit_golden_set
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view golden_set" ON public.chatwoot_audit_golden_set
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
CREATE TRIGGER trg_golden_set_updated_at BEFORE UPDATE ON public.chatwoot_audit_golden_set
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fase 3.2 — Alertas
CREATE TABLE IF NOT EXISTS public.chatwoot_audit_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  target_user_id uuid,
  target_email text,
  target_inbox text,
  severity text NOT NULL DEFAULT 'attention',
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chatwoot_audit_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage audit_alerts" ON public.chatwoot_audit_alerts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view audit_alerts" ON public.chatwoot_audit_alerts
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

-- Fase 3.3 — Novas dimensões
ALTER TABLE public.chatwoot_conversation_audits
  ADD COLUMN IF NOT EXISTS sla_compliance jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sentiment_arc jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS missed_opportunities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compliance_flags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technical_accuracy jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.chatwoot_audit_settings
  ADD COLUMN IF NOT EXISTS product_knowledge_base text;

-- Fase 3.4 — Relatórios
CREATE TABLE IF NOT EXISTS public.chatwoot_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chatwoot_audit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage audit_reports" ON public.chatwoot_audit_reports
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tatico view audit_reports" ON public.chatwoot_audit_reports
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));
