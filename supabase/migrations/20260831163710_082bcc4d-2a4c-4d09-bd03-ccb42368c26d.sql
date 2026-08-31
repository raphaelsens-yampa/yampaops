CREATE TABLE public.goal_growth_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_month date NOT NULL UNIQUE,
  growth_pct numeric NOT NULL DEFAULT 1,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_growth_baselines TO authenticated;
GRANT ALL ON public.goal_growth_baselines TO service_role;

ALTER TABLE public.goal_growth_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read growth baselines"
  ON public.goal_growth_baselines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/taticos can manage growth baselines"
  ON public.goal_growth_baselines FOR ALL TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER update_goal_growth_baselines_updated_at
  BEFORE UPDATE ON public.goal_growth_baselines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();