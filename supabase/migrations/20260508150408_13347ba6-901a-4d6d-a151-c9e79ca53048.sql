
-- Audit runs
CREATE TABLE public.chatwoot_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  total_conversations integer NOT NULL DEFAULT 0,
  analyzed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  triggered_by text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatwoot_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit_runs" ON public.chatwoot_audit_runs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view audit_runs" ON public.chatwoot_audit_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

-- Conversation audits
CREATE TABLE public.chatwoot_conversation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id bigint NOT NULL UNIQUE,
  run_id uuid REFERENCES public.chatwoot_audit_runs(id) ON DELETE SET NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  model_used text,
  assignee_id bigint,
  assignee_name text,
  assignee_email text,
  team_name text,
  inbox_name text,
  conversation_resolved_at timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  transcript_hash text,
  overall_score numeric NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'ok',
  tone_score numeric NOT NULL DEFAULT 0,
  tone_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  churn_risk_score numeric NOT NULL DEFAULT 0,
  churn_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  playbook_score numeric NOT NULL DEFAULT 0,
  playbook_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitor_mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  review_status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_audits_conversation ON public.chatwoot_conversation_audits(conversation_id);
CREATE INDEX idx_conv_audits_assignee ON public.chatwoot_conversation_audits(assignee_id);
CREATE INDEX idx_conv_audits_severity ON public.chatwoot_conversation_audits(severity);
CREATE INDEX idx_conv_audits_resolved_at ON public.chatwoot_conversation_audits(conversation_resolved_at);
CREATE INDEX idx_conv_audits_review_status ON public.chatwoot_conversation_audits(review_status);

ALTER TABLE public.chatwoot_conversation_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage conversation_audits" ON public.chatwoot_conversation_audits
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view conversation_audits" ON public.chatwoot_conversation_audits
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tatico'::app_role));

CREATE POLICY "Sellers view own conversation_audits" ON public.chatwoot_conversation_audits
  FOR SELECT TO authenticated USING (
    assignee_email IS NOT NULL AND
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND lower(p.email) = lower(assignee_email))
  );

CREATE TRIGGER trg_conv_audits_updated_at
  BEFORE UPDATE ON public.chatwoot_conversation_audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit settings (singleton)
CREATE TABLE public.chatwoot_audit_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  profanity_keywords text[] NOT NULL DEFAULT ARRAY['porra','merda','caralho','foda','idiota','imbecil','burro','otário']::text[],
  competitor_keywords text[] NOT NULL DEFAULT ARRAY['stone','pagseguro','mercado pago','cielo','rede','getnet','sumup','infinitepay']::text[],
  playbook_items jsonb NOT NULL DEFAULT '[
    {"key":"saudacao","label":"Saudou o cliente cordialmente"},
    {"key":"identificacao","label":"Se identificou (nome/empresa)"},
    {"key":"entendeu_problema","label":"Demonstrou entender o problema"},
    {"key":"ofereceu_solucao","label":"Ofereceu solução clara"},
    {"key":"ajuda_extra","label":"Perguntou se podia ajudar com algo mais"},
    {"key":"despedida","label":"Despediu-se de forma cordial"}
  ]'::jsonb,
  attention_threshold numeric NOT NULL DEFAULT 70,
  critical_threshold numeric NOT NULL DEFAULT 50,
  custom_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.chatwoot_audit_settings DEFAULT VALUES;

ALTER TABLE public.chatwoot_audit_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit_settings" ON public.chatwoot_audit_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view audit_settings" ON public.chatwoot_audit_settings
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_audit_settings_updated_at
  BEFORE UPDATE ON public.chatwoot_audit_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
