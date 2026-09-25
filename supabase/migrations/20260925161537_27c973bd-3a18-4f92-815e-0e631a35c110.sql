CREATE TABLE public.tv_display_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL UNIQUE CHECK (area IN ('sales','cs')),
  token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tv_display_links TO authenticated;
GRANT ALL ON public.tv_display_links TO service_role;
ALTER TABLE public.tv_display_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tv links" ON public.tv_display_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_tv_display_links_updated_at BEFORE UPDATE ON public.tv_display_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();