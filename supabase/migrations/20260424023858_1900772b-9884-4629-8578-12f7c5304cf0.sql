-- 1. Add new enum value to activity_type
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'chatwoot_status_change';

-- 2. Extend integration_settings with Chatwoot config
ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS chatwoot_base_url text,
  ADD COLUMN IF NOT EXISTS chatwoot_account_id bigint,
  ADD COLUMN IF NOT EXISTS chatwoot_webhook_secret text,
  ADD COLUMN IF NOT EXISTS chatwoot_last_event_at timestamptz;

-- 3. Extend activities with Chatwoot tracking columns
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS chatwoot_conversation_id bigint,
  ADD COLUMN IF NOT EXISTS chatwoot_message_id bigint;

CREATE INDEX IF NOT EXISTS idx_activities_chatwoot_conversation_id
  ON public.activities (chatwoot_conversation_id)
  WHERE chatwoot_conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_chatwoot_message_id_unique
  ON public.activities (chatwoot_message_id)
  WHERE chatwoot_message_id IS NOT NULL;

-- 4. Create chatwoot_conversations table (current state of each conversation)
CREATE TABLE IF NOT EXISTS public.chatwoot_conversations (
  chatwoot_conversation_id bigint PRIMARY KEY,
  chatwoot_account_id bigint NOT NULL,
  chatwoot_inbox_id bigint,
  status text NOT NULL DEFAULT 'open',
  tabulacao_atendimento text,
  contact_id uuid,
  opportunity_id uuid,
  contact_email text,
  contact_phone text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatwoot_conversations_contact_id
  ON public.chatwoot_conversations (contact_id);
CREATE INDEX IF NOT EXISTS idx_chatwoot_conversations_opportunity_id
  ON public.chatwoot_conversations (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_chatwoot_conversations_email
  ON public.chatwoot_conversations (contact_email);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_chatwoot_conversations_updated_at ON public.chatwoot_conversations;
CREATE TRIGGER update_chatwoot_conversations_updated_at
  BEFORE UPDATE ON public.chatwoot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS for chatwoot_conversations
ALTER TABLE public.chatwoot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage chatwoot_conversations"
  ON public.chatwoot_conversations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view chatwoot_conversations"
  ON public.chatwoot_conversations
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'tatico'::app_role));