
-- 1. Create pipeline_stages table
CREATE TABLE public.pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT NULL,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "Authenticated users can view stages"
  ON public.pipeline_stages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage stages"
  ON public.pipeline_stages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Seed with current stages
INSERT INTO public.pipeline_stages (name, slug, position, color, is_won, is_lost) VALUES
  ('Novo Lead', 'novo_lead', 0, '#94a3b8', false, false),
  ('Contato Realizado', 'contato_realizado', 1, '#3b82f6', false, false),
  ('Diagnóstico/Reunião', 'diagnostico', 2, '#8b5cf6', false, false),
  ('Proposta Enviada', 'proposta_enviada', 3, '#f59e0b', false, false),
  ('Negociação', 'negociacao', 4, '#f97316', false, false),
  ('Fechado (Won)', 'fechado_won', 5, '#22c55e', true, false),
  ('Perdido', 'perdido', 6, '#ef4444', false, true);

-- 5. Convert leads.stage from enum to text
ALTER TABLE public.leads ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN stage TYPE TEXT USING stage::TEXT;
ALTER TABLE public.leads ALTER COLUMN stage SET DEFAULT 'novo_lead';

-- 6. Trigger for updated_at
CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
