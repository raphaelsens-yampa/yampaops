CREATE TABLE public.campaign_month_projections (
  year_month date PRIMARY KEY,
  mrr numeric,
  qty integer,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_month_projections TO authenticated;
GRANT ALL ON public.campaign_month_projections TO service_role;
ALTER TABLE public.campaign_month_projections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read" ON public.campaign_month_projections FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));
CREATE POLICY "tatico write" ON public.campaign_month_projections FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));