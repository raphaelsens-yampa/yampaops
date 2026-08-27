CREATE TABLE public.chatwoot_csat_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chatwoot_account_id integer,
  chatwoot_conversation_id bigint NOT NULL,
  csat_id bigint,
  rating smallint,
  feedback_message text,
  contact_name text,
  contact_email text,
  contact_phone text,
  assignee_name text,
  assignee_email text,
  team_name text,
  inbox_name text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatwoot_csat_responses_conv_unique UNIQUE (chatwoot_conversation_id)
);

CREATE INDEX idx_cw_csat_responded_at ON public.chatwoot_csat_responses (responded_at DESC);
CREATE INDEX idx_cw_csat_assignee ON public.chatwoot_csat_responses (assignee_name);

GRANT SELECT ON public.chatwoot_csat_responses TO authenticated;
GRANT ALL ON public.chatwoot_csat_responses TO service_role;

ALTER TABLE public.chatwoot_csat_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read csat" ON public.chatwoot_csat_responses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages csat" ON public.chatwoot_csat_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_chatwoot_csat_responses_updated_at
  BEFORE UPDATE ON public.chatwoot_csat_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();