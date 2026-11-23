CREATE TABLE public.campaign_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month date NOT NULL,
  name text NOT NULL DEFAULT 'Campanha',
  start_date date NOT NULL,
  end_date date NOT NULL,
  mrr numeric,
  qty integer,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_projections TO authenticated;
GRANT ALL ON public.campaign_projections TO service_role;
ALTER TABLE public.campaign_projections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read" ON public.campaign_projections FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));
CREATE POLICY "tatico write" ON public.campaign_projections FOR ALL TO authenticated USING (public.is_tatico_or_admin(auth.uid())) WITH CHECK (public.is_tatico_or_admin(auth.uid()));
INSERT INTO public.campaign_projections (year_month, name, start_date, end_date, mrr, qty, updated_by, updated_at)
SELECT year_month, 'Campanhas do mês', year_month, (year_month + interval '1 month - 1 day')::date, mrr, qty, updated_by, updated_at FROM public.campaign_month_projections;
COMMENT ON TABLE public.campaign_month_projections IS 'DEPRECATED: replaced by campaign_projections';