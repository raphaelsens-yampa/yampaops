ALTER TABLE public.chatwoot_conversations
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversation_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignee_id bigint,
  ADD COLUMN IF NOT EXISTS assignee_name text,
  ADD COLUMN IF NOT EXISTS assignee_email text,
  ADD COLUMN IF NOT EXISTS team_id bigint,
  ADD COLUMN IF NOT EXISTS team_name text;

CREATE INDEX IF NOT EXISTS idx_cwconv_opened_at ON public.chatwoot_conversations (opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwconv_closed_at ON public.chatwoot_conversations (conversation_closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwconv_assignee ON public.chatwoot_conversations (assignee_id);
CREATE INDEX IF NOT EXISTS idx_cwconv_team ON public.chatwoot_conversations (team_id);
CREATE INDEX IF NOT EXISTS idx_cwconv_tabulacao ON public.chatwoot_conversations (tabulacao_atendimento);