-- Create pipelines table
CREATE TABLE public.pipelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pipelines" ON public.pipelines FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated view pipelines" ON public.pipelines FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_pipelines_updated_at BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default pipeline
INSERT INTO public.pipelines (id, name, is_default) VALUES ('00000000-0000-0000-0000-000000000001', 'Pipeline Principal', true);

-- Add pipeline_id to pipeline_stages
ALTER TABLE public.pipeline_stages ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Set all existing stages to default pipeline
UPDATE public.pipeline_stages SET pipeline_id = '00000000-0000-0000-0000-000000000001' WHERE pipeline_id IS NULL;

-- Make pipeline_id NOT NULL after backfill
ALTER TABLE public.pipeline_stages ALTER COLUMN pipeline_id SET NOT NULL;

-- Add pipeline_id to opportunities to track which pipeline they belong to
ALTER TABLE public.opportunities ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL DEFAULT '00000000-0000-0000-0000-000000000001';