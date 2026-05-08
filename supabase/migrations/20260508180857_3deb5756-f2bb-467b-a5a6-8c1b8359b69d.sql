-- Confiança da IA por auditoria
ALTER TABLE public.chatwoot_conversation_audits
  ADD COLUMN IF NOT EXISTS ai_confidence numeric;

-- Novos campos de configuração de revisão humana e cap diário
ALTER TABLE public.chatwoot_audit_settings
  ADD COLUMN IF NOT EXISTS human_review_percent_per_seller numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS human_review_new_seller_percent numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS human_review_new_seller_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS must_review_critical boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_review_lost boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_review_sla_breach boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_review_low_confidence boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS low_confidence_threshold numeric NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS daily_audit_cap integer;

-- Desabilitar amostragem de IA por default (passa a auditar 100%)
UPDATE public.chatwoot_audit_settings SET sampling_enabled = false;