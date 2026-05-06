
ALTER TABLE public.chatwoot_conversations
  ADD COLUMN IF NOT EXISTS first_contact_message_at timestamp with time zone;
