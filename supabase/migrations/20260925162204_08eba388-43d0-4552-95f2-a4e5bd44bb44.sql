CREATE TABLE public.operational_goal_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL CHECK (area IN ('sales','cs')),
  year_month date NOT NULL,
  growth_pct numeric NOT NULL CHECK (growth_pct > 0 AND growth_pct <= 100),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area, year_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_goal_overrides TO authenticated;
GRANT ALL ON public.operational_goal_overrides TO service_role;
ALTER TABLE public.operational_goal_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read overrides" ON public.operational_goal_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only Raphael writes overrides" ON public.operational_goal_overrides FOR ALL TO authenticated
  USING (lower(auth.jwt()->>'email') = 'raphael@yampa.com.br')
  WITH CHECK (lower(auth.jwt()->>'email') = 'raphael@yampa.com.br');
CREATE TRIGGER update_operational_goal_overrides_updated_at BEFORE UPDATE ON public.operational_goal_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();