-- Enums
CREATE TYPE public.lead_origin AS ENUM ('freetrial', 'cursos', 'outbound', 'campanhas', 'base');
CREATE TYPE public.lead_stage AS ENUM ('novo_lead', 'contato_realizado', 'diagnostico', 'proposta_enviada', 'negociacao', 'fechado_won', 'perdido');
CREATE TYPE public.activity_type AS ENUM ('mensagem_enviada', 'resposta_recebida', 'call_realizada', 'reuniao_executada');
CREATE TYPE public.attribution_model AS ENUM ('first_click', 'last_click');
CREATE TYPE public.app_role AS ENUM ('admin', 'seller');

-- Updated at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Leads
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  origin lead_origin NOT NULL DEFAULT 'freetrial',
  consultant_id UUID REFERENCES auth.users(id),
  stage lead_stage NOT NULL DEFAULT 'novo_lead',
  estimated_mrr NUMERIC(12,2) DEFAULT 0,
  estimated_tpv NUMERIC(14,2) DEFAULT 0,
  take_rate NUMERIC(5,4) DEFAULT 0,
  attribution attribution_model DEFAULT 'last_click',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_interaction_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Activities
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type activity_type NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Goals
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  channel lead_origin,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_mrr NUMERIC(12,2) DEFAULT 0,
  target_deals INTEGER DEFAULT 0,
  target_tpv NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'seller');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Leads
CREATE POLICY "Sellers see own leads" ON public.leads FOR SELECT USING (auth.uid() = consultant_id);
CREATE POLICY "Admins see all leads" ON public.leads FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sellers manage own leads" ON public.leads FOR ALL USING (auth.uid() = consultant_id);
CREATE POLICY "Admins manage all leads" ON public.leads FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Activities
CREATE POLICY "Sellers see own activities" ON public.activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins see all activities" ON public.activities FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own activities" ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all activities" ON public.activities FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Goals
CREATE POLICY "Sellers see own goals" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins see all goals" ON public.goals FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all goals" ON public.goals FOR ALL USING (public.has_role(auth.uid(), 'admin'));