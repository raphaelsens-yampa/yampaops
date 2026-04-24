
CREATE OR REPLACE FUNCTION public.prevent_system_tag_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'Tag de sistema "%" não pode ser excluída.', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;
