
-- ============================================================
-- 1. Datas de negócio em opportunities
-- ============================================================
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS opportunity_created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS converted_at timestamp with time zone;

-- Backfill
UPDATE public.opportunities
SET opportunity_created_at = COALESCE(opportunity_created_at, created_at);

UPDATE public.opportunities o
SET converted_at = COALESCE(o.converted_at, o.updated_at)
FROM public.pipeline_stages ps
WHERE ps.pipeline_id = o.pipeline_id
  AND ps.slug = o.stage
  AND ps.is_won = true
  AND o.converted_at IS NULL;

UPDATE public.opportunities o
SET closed_at = COALESCE(o.closed_at, o.updated_at)
FROM public.pipeline_stages ps
WHERE ps.pipeline_id = o.pipeline_id
  AND ps.slug = o.stage
  AND (ps.is_won = true OR ps.is_lost = true)
  AND o.closed_at IS NULL;

-- Backfill legado para slugs hardcoded
UPDATE public.opportunities
SET converted_at = COALESCE(converted_at, updated_at),
    closed_at   = COALESCE(closed_at, updated_at)
WHERE stage = 'fechado_won' AND converted_at IS NULL;

UPDATE public.opportunities
SET closed_at = COALESCE(closed_at, updated_at)
WHERE stage = 'perdido' AND closed_at IS NULL;

-- Trigger: mantém closed_at e converted_at em sincronia com a etapa
CREATE OR REPLACE FUNCTION public.set_opportunity_dates_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_won boolean := false;
  v_is_lost boolean := false;
BEGIN
  -- Só atua se a etapa mudou (ou é INSERT)
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  -- Resolve flags da nova etapa
  SELECT COALESCE(is_won, false), COALESCE(is_lost, false)
  INTO v_is_won, v_is_lost
  FROM public.pipeline_stages
  WHERE pipeline_id = NEW.pipeline_id AND slug = NEW.stage
  LIMIT 1;

  -- Compat com slugs hardcoded
  IF NEW.stage = 'fechado_won' THEN v_is_won := true; END IF;
  IF NEW.stage = 'perdido' THEN v_is_lost := true; END IF;

  -- converted_at: marca se entrou em won; limpa se saiu de won
  IF v_is_won THEN
    IF NEW.converted_at IS NULL THEN
      NEW.converted_at := now();
    END IF;
  ELSE
    NEW.converted_at := NULL;
  END IF;

  -- closed_at: marca se won OU lost; limpa caso contrário
  IF v_is_won OR v_is_lost THEN
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_dates ON public.opportunities;
CREATE TRIGGER trg_opportunity_dates
  BEFORE INSERT OR UPDATE OF stage ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_opportunity_dates_on_stage_change();

-- Índices úteis para relatórios e funil por safra
CREATE INDEX IF NOT EXISTS idx_opportunities_opp_created_at ON public.opportunities(opportunity_created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_converted_at ON public.opportunities(converted_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_closed_at ON public.opportunities(closed_at);


-- ============================================================
-- 2. Sistema de Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#3b82f6',
  is_system boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tags"
  ON public.tags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated view tags"
  ON public.tags FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Bloqueia delete de tags de sistema
CREATE OR REPLACE FUNCTION public.prevent_system_tag_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'Tag de sistema "%" não pode ser excluída.', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_tags_no_delete_system
  BEFORE DELETE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_system_tag_delete();

-- Tabela pivot
CREATE TABLE IF NOT EXISTS public.opportunity_tags (
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (opportunity_id, tag_id)
);

ALTER TABLE public.opportunity_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage opportunity_tags"
  ON public.opportunity_tags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tatico view opportunity_tags"
  ON public.opportunity_tags FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'tatico'::app_role));

CREATE POLICY "Sellers view tags of own opportunities"
  ON public.opportunity_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_tags.opportunity_id
        AND o.consultant_id = auth.uid()
    )
  );

CREATE POLICY "Sellers add tags to own opportunities"
  ON public.opportunity_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_tags.opportunity_id
        AND o.consultant_id = auth.uid()
    )
  );

CREATE POLICY "Sellers remove tags from own opportunities"
  ON public.opportunity_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_tags.opportunity_id
        AND o.consultant_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_opportunity_tags_tag ON public.opportunity_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_tags_opp ON public.opportunity_tags(opportunity_id);


-- ============================================================
-- 3. Seed das 4 tags de sistema do Chatwoot
-- ============================================================
INSERT INTO public.tags (name, slug, color, is_system, description) VALUES
  ('Conversa criada',     'chatwoot-conversation-created', '#3b82f6', true, 'Aplicada quando uma conversa é criada no Chatwoot.'),
  ('Conversa atualizada', 'chatwoot-conversation-updated', '#94a3b8', true, 'Aplicada quando uma conversa é atualizada no Chatwoot.'),
  ('Conversa finalizada', 'chatwoot-conversation-closed',  '#22c55e', true, 'Aplicada quando o status da conversa muda no Chatwoot.'),
  ('Mensagem respondida', 'chatwoot-message-replied',      '#a855f7', true, 'Aplicada quando o cliente responde no Chatwoot.')
ON CONFLICT (slug) DO NOTHING;
