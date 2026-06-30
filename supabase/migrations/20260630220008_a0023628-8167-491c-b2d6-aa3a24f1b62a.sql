
CREATE TABLE public.chatwoot_ac_note_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatwoot_conversation_id bigint NOT NULL,
  ac_contact_id text NOT NULL,
  ac_note_id text NOT NULL,
  match_method text NOT NULL CHECK (match_method IN ('email','phone')),
  match_value text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatwoot_conversation_id, ac_contact_id)
);

GRANT SELECT ON public.chatwoot_ac_note_links TO authenticated;
GRANT ALL ON public.chatwoot_ac_note_links TO service_role;

ALTER TABLE public.chatwoot_ac_note_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read note links"
ON public.chatwoot_ac_note_links
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_cw_ac_note_links_conv ON public.chatwoot_ac_note_links(chatwoot_conversation_id);
CREATE INDEX idx_cw_ac_note_links_synced ON public.chatwoot_ac_note_links(last_synced_at DESC);

CREATE TRIGGER trg_cw_ac_note_links_updated
BEFORE UPDATE ON public.chatwoot_ac_note_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
