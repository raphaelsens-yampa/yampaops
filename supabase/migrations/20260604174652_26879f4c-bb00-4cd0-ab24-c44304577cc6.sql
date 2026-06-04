
-- Proposals table for standalone Precificação proposal builder
CREATE TABLE public.precificacao_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.precificacao_proposals(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  proposal_number text,
  client_name text NOT NULL,
  client_company text,
  consultant text,
  proposal_date text,
  validity int NOT NULL DEFAULT 15,
  discount_pct numeric NOT NULL DEFAULT 0,
  payment text,
  notes text,
  custom_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_annual numeric NOT NULL DEFAULT 0,
  total_monthly numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.precificacao_proposals TO authenticated;
GRANT ALL ON public.precificacao_proposals TO service_role;

ALTER TABLE public.precificacao_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view precificacao proposals"
  ON public.precificacao_proposals FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated insert own precificacao proposals"
  ON public.precificacao_proposals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Only admins delete precificacao proposals"
  ON public.precificacao_proposals FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_precificacao_proposals_created_at ON public.precificacao_proposals(created_at DESC);
CREATE INDEX idx_precificacao_proposals_parent ON public.precificacao_proposals(parent_id);

-- Audit log table (immutable, append-only)
CREATE TABLE public.precificacao_proposal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.precificacao_proposal_logs TO authenticated;
GRANT ALL ON public.precificacao_proposal_logs TO service_role;

ALTER TABLE public.precificacao_proposal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view proposal logs"
  ON public.precificacao_proposal_logs FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger: log deletions automatically
CREATE OR REPLACE FUNCTION public.log_precificacao_proposal_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.precificacao_proposal_logs (proposal_id, action, performed_by, snapshot)
  VALUES (
    OLD.id,
    'deleted',
    auth.uid(),
    to_jsonb(OLD)
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_precificacao_proposal_delete
BEFORE DELETE ON public.precificacao_proposals
FOR EACH ROW EXECUTE FUNCTION public.log_precificacao_proposal_delete();
