-- =========================================
-- PRICING MODULE
-- =========================================

CREATE TABLE public.pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  is_active boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','seed','duplicate')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_versions TO authenticated;
GRANT ALL ON public.pricing_versions TO service_role;

ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pricing versions"
  ON public.pricing_versions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage pricing versions"
  ON public.pricing_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pricing_versions_updated_at
  BEFORE UPDATE ON public.pricing_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Garante apenas 1 active
CREATE UNIQUE INDEX uniq_pricing_versions_one_active
  ON public.pricing_versions ((is_active)) WHERE is_active = true;

-- =========================================

CREATE TABLE public.pricing_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.pricing_versions(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  proposal_number text,
  client_name text NOT NULL,
  client_doc text,
  client_email text,
  client_phone text,
  executive_summary text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  discount_pct numeric NOT NULL DEFAULT 0,
  total_monthly numeric NOT NULL DEFAULT 0,
  total_annual numeric NOT NULL DEFAULT 0,
  total_setup numeric NOT NULL DEFAULT 0,
  payment_terms text,
  valid_until date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  pdf_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_proposals TO authenticated;
GRANT ALL ON public.pricing_proposals TO service_role;

ALTER TABLE public.pricing_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view proposals"
  ON public.pricing_proposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own proposals"
  ON public.pricing_proposals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authors and admins update proposals"
  ON public.pricing_proposals FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authors and admins delete proposals"
  ON public.pricing_proposals FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pricing_proposals_updated_at
  BEFORE UPDATE ON public.pricing_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pricing_proposals_version ON public.pricing_proposals(version_id);
CREATE INDEX idx_pricing_proposals_opp ON public.pricing_proposals(opportunity_id);
CREATE INDEX idx_pricing_proposals_created_by ON public.pricing_proposals(created_by);
