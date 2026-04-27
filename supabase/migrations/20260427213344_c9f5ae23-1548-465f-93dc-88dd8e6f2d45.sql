-- 1) Normalizar emails existentes (lowercase + trim) para deduplicar corretamente
UPDATE public.contacts
SET email = lower(trim(email))
WHERE email IS NOT NULL AND email <> lower(trim(email));

-- 2) Identificar o "vencedor" para cada email (mais antigo, com prioridade pra quem tem ac_id)
CREATE TEMP TABLE contact_winners AS
SELECT DISTINCT ON (lower(email))
  id AS winner_id,
  lower(email) AS norm_email
FROM public.contacts
WHERE email IS NOT NULL AND email <> ''
ORDER BY lower(email),
         (ac_id IS NULL),         -- false (com ac_id) vem primeiro
         created_at ASC;

-- 3) Mapear duplicatas -> vencedor
CREATE TEMP TABLE contact_dup_map AS
SELECT c.id AS dup_id, w.winner_id
FROM public.contacts c
JOIN contact_winners w ON lower(c.email) = w.norm_email
WHERE c.id <> w.winner_id;

-- 4) Repontar referências em opportunities
UPDATE public.opportunities o
SET contact_id = m.winner_id
FROM contact_dup_map m
WHERE o.contact_id = m.dup_id;

-- 5) Repontar referências em chatwoot_conversations
UPDATE public.chatwoot_conversations cc
SET contact_id = m.winner_id
FROM contact_dup_map m
WHERE cc.contact_id = m.dup_id;

-- 6) Deletar duplicatas
DELETE FROM public.contacts
WHERE id IN (SELECT dup_id FROM contact_dup_map);

-- 7) Índice único parcial em lower(email) (ignora null/vazio)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_lower_email_unique
ON public.contacts (lower(email))
WHERE email IS NOT NULL AND email <> '';

-- 8) Índice único em ac_id (ignora null)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_ac_id_unique
ON public.contacts (ac_id)
WHERE ac_id IS NOT NULL;

-- 9) Trigger de normalização de email em insert/update
CREATE OR REPLACE FUNCTION public.normalize_contact_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
    IF NEW.email = '' THEN
      NEW.email := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_contact_email ON public.contacts;
CREATE TRIGGER trg_normalize_contact_email
BEFORE INSERT OR UPDATE OF email ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.normalize_contact_email();