
CREATE TABLE IF NOT EXISTS public.chatwoot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatwoot_message_id bigint NOT NULL,
  chatwoot_conversation_id bigint NOT NULL,
  chatwoot_account_id bigint,
  chatwoot_inbox_id bigint,
  inbox_name text,
  sender_type text NOT NULL, -- 'agent' | 'client' | 'system'
  sender_id bigint,
  sender_name text,
  sender_email text,
  message_type integer, -- 0 incoming, 1 outgoing, 2 activity, 3 template
  content_preview text,
  is_private boolean NOT NULL DEFAULT false,
  message_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatwoot_message_id)
);

CREATE INDEX IF NOT EXISTS idx_cw_msg_conv ON public.chatwoot_messages (chatwoot_conversation_id);
CREATE INDEX IF NOT EXISTS idx_cw_msg_created ON public.chatwoot_messages (message_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cw_msg_sender_email ON public.chatwoot_messages (sender_email);
CREATE INDEX IF NOT EXISTS idx_cw_msg_sender_type ON public.chatwoot_messages (sender_type);

ALTER TABLE public.chatwoot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage chatwoot_messages"
  ON public.chatwoot_messages
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view chatwoot_messages"
  ON public.chatwoot_messages
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'tatico'::app_role));
