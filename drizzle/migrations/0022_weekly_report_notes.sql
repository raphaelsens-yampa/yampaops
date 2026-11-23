CREATE TABLE public.weekly_report_notes (
  week_start date PRIMARY KEY,
  highlights text NOT NULL DEFAULT '',
  risks text NOT NULL DEFAULT '',
  actions text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_report_notes TO authenticated;
GRANT ALL ON public.weekly_report_notes TO service_role;
ALTER TABLE public.weekly_report_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read weekly notes" ON public.weekly_report_notes FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));
CREATE POLICY "managers write weekly notes" ON public.weekly_report_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tatico'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tatico'));