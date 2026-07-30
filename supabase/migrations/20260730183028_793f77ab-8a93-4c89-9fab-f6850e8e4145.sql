CREATE TABLE public.tactical_recoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text,
  customer_email text,
  plan_name text,
  seller_id uuid,
  recovered_at date NOT NULL DEFAULT CURRENT_DATE,
  price numeric NOT NULL DEFAULT 0,
  mrr numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_tactical_recoveries_date ON public.tactical_recoveries (recovered_at);
CREATE INDEX idx_tactical_recoveries_seller ON public.tactical_recoveries (seller_id, recovered_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_recoveries TO authenticated;
GRANT ALL ON public.tactical_recoveries TO service_role;

ALTER TABLE public.tactical_recoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tactical_recoveries_select ON public.tactical_recoveries FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR created_by = auth.uid() OR is_tatico_or_admin(auth.uid()));
CREATE POLICY tactical_recoveries_insert ON public.tactical_recoveries FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR is_tatico_or_admin(auth.uid()));
CREATE POLICY tactical_recoveries_update ON public.tactical_recoveries FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR created_by = auth.uid() OR is_tatico_or_admin(auth.uid()))
  WITH CHECK (seller_id = auth.uid() OR created_by = auth.uid() OR is_tatico_or_admin(auth.uid()));
CREATE POLICY tactical_recoveries_delete ON public.tactical_recoveries FOR DELETE TO authenticated
  USING (seller_id = auth.uid() OR created_by = auth.uid() OR is_tatico_or_admin(auth.uid()));

CREATE TRIGGER update_tactical_recoveries_updated_at BEFORE UPDATE ON public.tactical_recoveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();