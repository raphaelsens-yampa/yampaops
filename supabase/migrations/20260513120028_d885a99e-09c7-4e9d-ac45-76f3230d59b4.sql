
-- Função utilitária para normalizar telefone (apenas dígitos)
CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_digits) < 8 THEN RETURN NULL; END IF;
  -- normaliza para sufixo de 11 dígitos quando for número brasileiro
  IF length(v_digits) > 11 THEN
    v_digits := right(v_digits, 11);
  END IF;
  RETURN v_digits;
END;
$$;

-- Tabela espelho dos Contatos do Chatwoot
CREATE TABLE public.chatwoot_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatwoot_contact_id bigint NOT NULL UNIQUE,
  chatwoot_account_id bigint,
  identifier text,
  name text,
  email text,
  phone_e164 text,
  phone_digits text,
  additional_emails text[] NOT NULL DEFAULT '{}',
  additional_phones text[] NOT NULL DEFAULT '{}',
  company_name text,
  city text,
  country_code text,
  custom_attributes jsonb NOT NULL DEFAULT '{}',
  additional_attributes jsonb NOT NULL DEFAULT '{}',
  inbox_ids bigint[] NOT NULL DEFAULT '{}',
  conversations_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  created_at_chatwoot timestamptz,
  raw jsonb NOT NULL DEFAULT '{}',
  matched_contact_id uuid,
  match_method text,
  matched_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cw_contacts_email ON public.chatwoot_contacts ((lower(email)));
CREATE INDEX idx_cw_contacts_phone_digits ON public.chatwoot_contacts (phone_digits);
CREATE INDEX idx_cw_contacts_addl_emails ON public.chatwoot_contacts USING GIN (additional_emails);
CREATE INDEX idx_cw_contacts_addl_phones ON public.chatwoot_contacts USING GIN (additional_phones);
CREATE INDEX idx_cw_contacts_custom_attrs ON public.chatwoot_contacts USING GIN (custom_attributes);
CREATE INDEX idx_cw_contacts_identifier ON public.chatwoot_contacts (identifier);
CREATE INDEX idx_cw_contacts_matched ON public.chatwoot_contacts (matched_contact_id);

-- Trigger para preencher email lower + phone_digits
CREATE OR REPLACE FUNCTION public.cw_contacts_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;
  NEW.phone_digits := public.normalize_phone_digits(COALESCE(NEW.phone_e164, NEW.phone_digits));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cw_contacts_normalize
BEFORE INSERT OR UPDATE ON public.chatwoot_contacts
FOR EACH ROW EXECUTE FUNCTION public.cw_contacts_normalize();

ALTER TABLE public.chatwoot_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage chatwoot_contacts"
ON public.chatwoot_contacts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view chatwoot_contacts"
ON public.chatwoot_contacts FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tatico'::app_role));

-- Log de tentativas de match
CREATE TABLE public.chatwoot_contact_match_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatwoot_contact_id bigint NOT NULL,
  method text NOT NULL,
  matched_contact_id uuid,
  matched_opportunity_id uuid,
  confidence numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cw_match_log_contact ON public.chatwoot_contact_match_log (chatwoot_contact_id);
CREATE INDEX idx_cw_match_log_method ON public.chatwoot_contact_match_log (method);

ALTER TABLE public.chatwoot_contact_match_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cw_match_log"
ON public.chatwoot_contact_match_log FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view cw_match_log"
ON public.chatwoot_contact_match_log FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tatico'::app_role));

-- Coluna em chatwoot_conversations para vincular ao contato espelhado
ALTER TABLE public.chatwoot_conversations
  ADD COLUMN IF NOT EXISTS chatwoot_contact_id bigint;

CREATE INDEX IF NOT EXISTS idx_cw_conv_contact_id ON public.chatwoot_conversations (chatwoot_contact_id);
