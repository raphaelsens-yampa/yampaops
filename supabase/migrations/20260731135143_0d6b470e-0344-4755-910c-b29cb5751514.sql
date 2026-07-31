CREATE TABLE public.tactical_lowtouch_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_lowtouch_areas TO authenticated;
GRANT ALL ON public.tactical_lowtouch_areas TO service_role;

ALTER TABLE public.tactical_lowtouch_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lowtouch areas readable by authenticated"
  ON public.tactical_lowtouch_areas FOR SELECT TO authenticated USING (true);

CREATE POLICY "lowtouch areas managed by admin or tatico"
  ON public.tactical_lowtouch_areas FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_lowtouch_areas_updated_at
  BEFORE UPDATE ON public.tactical_lowtouch_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tactical_lowtouch_areas (label, is_active)
VALUES ('Produto', true), ('Marketing', true), ('Parceria', true), ('CX', true), ('4blue', true)
ON CONFLICT (label) DO NOTHING;