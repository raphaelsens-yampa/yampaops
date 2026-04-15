
-- 1A. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS email text;

-- 1B. Create teams and team_members
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage teams" ON public.teams FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated view teams" ON public.teams FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_in_team text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage team_members" ON public.team_members FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own memberships" ON public.team_members FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all memberships" ON public.team_members FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 1C. Create contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  company text,
  segment text,
  icp_level integer CHECK (icp_level >= 1 AND icp_level <= 5),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contacts" ON public.contacts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers view own contacts" ON public.contacts FOR SELECT
  TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Sellers insert own contacts" ON public.contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Sellers update own contacts" ON public.contacts FOR UPDATE
  TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1D. Rename leads to opportunities and add columns
ALTER TABLE public.leads RENAME TO opportunities;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id),
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS sub_origin text,
  ADD COLUMN IF NOT EXISTS estimated_close_date date,
  ADD COLUMN IF NOT EXISTS probability numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_reason text;

-- Update existing RLS policy names for opportunities
-- Drop old policies
DROP POLICY IF EXISTS "Admins manage all leads" ON public.opportunities;
DROP POLICY IF EXISTS "Admins see all leads" ON public.opportunities;
DROP POLICY IF EXISTS "Sellers manage own leads" ON public.opportunities;
DROP POLICY IF EXISTS "Sellers see own leads" ON public.opportunities;

-- Recreate with new names
CREATE POLICY "Admins manage all opportunities" ON public.opportunities FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins see all opportunities" ON public.opportunities FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sellers manage own opportunities" ON public.opportunities FOR ALL
  USING (auth.uid() = consultant_id);

CREATE POLICY "Sellers see own opportunities" ON public.opportunities FOR SELECT
  USING (auth.uid() = consultant_id);

-- 1E. Update activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS result text;

-- Migrate lead_id data to opportunity_id
UPDATE public.activities SET opportunity_id = lead_id WHERE opportunity_id IS NULL;

-- Add new activity types
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'proposta';

-- 1F. Extend goals
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS campaign text,
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'company';

-- 1G. Add new lead_origin values
ALTER TYPE public.lead_origin ADD VALUE IF NOT EXISTS 'campanhas_marketing';
ALTER TYPE public.lead_origin ADD VALUE IF NOT EXISTS 'campanhas_base';

-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
