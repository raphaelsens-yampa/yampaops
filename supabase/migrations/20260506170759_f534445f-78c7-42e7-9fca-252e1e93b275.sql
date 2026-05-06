
ALTER TABLE public.chatwoot_conversations
  ADD COLUMN IF NOT EXISTS inbox_name text,
  ADD COLUMN IF NOT EXISTS first_response_at timestamp with time zone;
