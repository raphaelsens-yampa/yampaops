CREATE TABLE public.cs_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#01B8E0',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cs_client_tags (
  email text NOT NULL,
  tag_id uuid NOT NULL REFERENCES public.cs_tags(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_client_tags TO authenticated;
GRANT ALL ON public.cs_tags TO service_role;
GRANT ALL ON public.cs_client_tags TO service_role;
ALTER TABLE public.cs_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_client_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_tags all auth" ON public.cs_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cs_client_tags all auth" ON public.cs_client_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);