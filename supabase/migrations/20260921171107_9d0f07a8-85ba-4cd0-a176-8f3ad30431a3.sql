CREATE TABLE public.campaign_history_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaign_history(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  reason text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_history_audit_campaign ON public.campaign_history_audit(campaign_id, created_at DESC);

GRANT SELECT, INSERT ON public.campaign_history_audit TO authenticated;
GRANT ALL ON public.campaign_history_audit TO service_role;

ALTER TABLE public.campaign_history_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view campaign_history_audit"
ON public.campaign_history_audit FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tatico or admin insert campaign_history_audit"
ON public.campaign_history_audit FOR INSERT TO authenticated
WITH CHECK (is_tatico_or_admin(auth.uid()) AND changed_by = auth.uid());