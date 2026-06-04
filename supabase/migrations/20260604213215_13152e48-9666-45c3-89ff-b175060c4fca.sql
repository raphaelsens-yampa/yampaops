
CREATE TABLE public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  logo text,
  custom_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_id uuid REFERENCES public.proposal_templates(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_templates TO authenticated;
GRANT ALL ON public.proposal_templates TO service_role;

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
  ON public.proposal_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create templates"
  ON public.proposal_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update templates"
  ON public.proposal_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete templates"
  ON public.proposal_templates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_proposal_templates_parent ON public.proposal_templates(parent_id);
CREATE INDEX idx_proposal_templates_created_at ON public.proposal_templates(created_at DESC);
