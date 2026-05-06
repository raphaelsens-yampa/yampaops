
ALTER TABLE public.chatwoot_conversations
ADD COLUMN IF NOT EXISTS tm1r_seconds integer
GENERATED ALWAYS AS (
  CASE
    WHEN first_response_at IS NOT NULL
     AND first_contact_message_at IS NOT NULL
     AND first_response_at >= first_contact_message_at
    THEN EXTRACT(EPOCH FROM (first_response_at - first_contact_message_at))::integer
    ELSE NULL
  END
) STORED;

CREATE INDEX IF NOT EXISTS idx_chatwoot_conversations_tm1r_seconds
  ON public.chatwoot_conversations (tm1r_seconds)
  WHERE tm1r_seconds IS NOT NULL;
