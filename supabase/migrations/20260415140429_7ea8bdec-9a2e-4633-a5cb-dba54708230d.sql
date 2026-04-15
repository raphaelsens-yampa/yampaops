
-- 1. Create access_levels table
CREATE TABLE public.access_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.access_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view access levels"
  ON public.access_levels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage access levels"
  ON public.access_levels FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_access_levels_updated_at
  BEFORE UPDATE ON public.access_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create user_access_levels assignment table
CREATE TABLE public.user_access_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  access_level_id UUID NOT NULL REFERENCES public.access_levels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, access_level_id)
);

ALTER TABLE public.user_access_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access level"
  ON public.user_access_levels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all access levels"
  ON public.user_access_levels FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage user access levels"
  ON public.user_access_levels FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Seed default access levels
INSERT INTO public.access_levels (name, description, is_system, permissions) VALUES
(
  'Administrador',
  'Acesso total a todas as áreas do CRM',
  true,
  '{
    "dashboard": {"view": true, "create": true, "edit": true},
    "pipeline": {"view": true, "create": true, "edit": true},
    "forecast": {"view": true, "create": true, "edit": true},
    "goals": {"view": true, "create": true, "edit": true},
    "team": {"view": true, "create": true, "edit": true},
    "import": {"view": true, "create": true, "edit": true},
    "users": {"view": true, "create": true, "edit": true}
  }'::jsonb
),
(
  'Vendedor',
  'Acesso ao pipeline próprio e metas',
  true,
  '{
    "dashboard": {"view": false, "create": false, "edit": false},
    "pipeline": {"view": true, "create": true, "edit": true},
    "forecast": {"view": false, "create": false, "edit": false},
    "goals": {"view": true, "create": false, "edit": false},
    "team": {"view": false, "create": false, "edit": false},
    "import": {"view": false, "create": false, "edit": false},
    "users": {"view": false, "create": false, "edit": false}
  }'::jsonb
);
